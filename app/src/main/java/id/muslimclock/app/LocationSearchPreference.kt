package id.muslimclock.app

import android.content.Context
import android.location.Geocoder
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.TextWatcher
import android.util.AttributeSet
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import androidx.preference.DialogPreference
import androidx.preference.Preference
import androidx.preference.PreferenceDialogFragmentCompat
import androidx.preference.PreferenceFragmentCompat
import androidx.preference.PreferenceManager
import java.util.Locale
import java.util.concurrent.Executors

/**
 * A "pick a city" preference. Stores nothing of its own — when the user
 * picks a result the dialog writes lat / lng / timezone into three
 * separate string preferences via [PreferenceManager.getDefaultSharedPreferences].
 *
 * Why not three independent preferences? The whole point of the picker
 * is to set them as an atomic group: it makes no sense for someone to
 * end up with Surabaya's latitude but Jakarta's timezone. So the
 * preference is a click-only entry and we write the trio in one
 * `apply()`.
 *
 * Search strategy:
 *  1. Substring match against the bundled [IndonesianCities] list.
 *     Always available, no permissions, instant.
 *  2. If the query has 4+ chars and no match was found locally, fall
 *     back to [Geocoder] (debounced) so users in non-Indonesian or
 *     small towns can still find their location. Geocoder runs off-
 *     thread and skips silently if the device has no service.
 */
class LocationSearchPreference @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = androidx.preference.R.attr.dialogPreferenceStyle,
    defStyleRes: Int = 0
) : DialogPreference(context, attrs, defStyleAttr, defStyleRes) {

    companion object {
        // Three SharedPreferences keys the bundled config flow already uses.
        const val K_LAT = Settings.K_LAT
        const val K_LNG = Settings.K_LNG
        const val K_TZ  = Settings.K_TIMEZONE
    }

    init {
        // We never read/write our own value — but we still need a key
        // so PreferenceFragment can route the dialog. The XML supplies
        // it ("location_picker").
        isPersistent = false
    }

    /**
     * Render summary based on the current lat/lng saved in
     * SharedPreferences. Re-bound whenever any of the underlying values
     * change (Preference framework calls notifyChanged on the host
     * after edits, which we trigger from the dialog).
     */
    override fun onBindViewHolder(holder: androidx.preference.PreferenceViewHolder) {
        super.onBindViewHolder(holder)
        val prefs = PreferenceManager.getDefaultSharedPreferences(context)
        val lat = prefs.getString(K_LAT, "") ?: ""
        val lng = prefs.getString(K_LNG, "") ?: ""
        val tz  = prefs.getString(K_TZ,  "") ?: ""
        val matched = matchKnownCity(lat, lng)
        val summaryView = holder.findViewById(android.R.id.summary) as? TextView
        if (summaryView != null) {
            summaryView.text = when {
                matched != null  -> "${matched.name}, ${matched.province}  ·  $tz"
                lat.isNotBlank() && lng.isNotBlank() -> "$lat, $lng  ·  $tz"
                else -> context.getString(R.string.pref_location_search_sum)
            }
            summaryView.visibility = View.VISIBLE
        }
    }

    /** Public trigger so the dialog can request a rebind after writing prefs. */
    fun refreshSummary() {
        // Setting summary to itself triggers the framework's notifyChanged()
        // internally, which re-binds the view holder and refreshes our
        // custom summary rendering in onBindViewHolder.
        summary = summary
    }

    /** Best-effort match: identifies the city by within-0.05° proximity. */
    private fun matchKnownCity(latS: String, lngS: String): IndoCity? {
        val lat = latS.toDoubleOrNull() ?: return null
        val lng = lngS.toDoubleOrNull() ?: return null
        return IndonesianCities.ALL.firstOrNull {
            kotlin.math.abs(it.lat - lat) < 0.05 &&
            kotlin.math.abs(it.lng - lng) < 0.05
        }
    }
}


/**
 * Dialog backing [LocationSearchPreference].
 *
 * UI: a search EditText on top, a ListView of results below. Tapping a
 * row writes the trio (lat, lng, timezone) and dismisses.
 */
class LocationSearchDialogFragment : PreferenceDialogFragmentCompat() {

    private val mainHandler = Handler(Looper.getMainLooper())
    private val geocoderExecutor = Executors.newSingleThreadExecutor()
    private var pendingGeocode: Runnable? = null

    private lateinit var adapter: ResultAdapter
    private lateinit var emptyView: TextView

    override fun onCreateDialogView(context: Context): View {
        val density = context.resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(12), dp(20), dp(8))
        }

        val searchInput = EditText(context).apply {
            hint = context.getString(R.string.pref_location_search_hint)
            isSingleLine = true
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }
        root.addView(searchInput)

        val listView = ListView(context).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
                1f
            ).apply { topMargin = dp(8) }
        }
        adapter = ResultAdapter(context)
        listView.adapter = adapter
        listView.setOnItemClickListener { _, _, position, _ ->
            val item = adapter.getItem(position) as? IndoCity ?: return@setOnItemClickListener
            commitCity(item)
        }
        root.addView(listView)

        emptyView = TextView(context).apply {
            text = context.getString(R.string.pref_location_search_empty)
            gravity = Gravity.CENTER
            setPadding(0, dp(16), 0, 0)
            visibility = View.GONE
            setTextColor(0xFF777777.toInt())
        }
        root.addView(emptyView)

        // Initial population: full curated list.
        adapter.replaceAll(IndonesianCities.search("", limit = 80))

        searchInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val q = s?.toString().orEmpty()
                runSearch(q)
            }
        })

        return root
    }

    private fun runSearch(query: String) {
        val local = IndonesianCities.search(query, limit = 80)
        adapter.replaceAll(local)
        emptyView.visibility = if (local.isEmpty()) View.VISIBLE else View.GONE

        // Cancel any pending geocoder run.
        pendingGeocode?.let { mainHandler.removeCallbacks(it) }
        pendingGeocode = null

        // Only fall back to Geocoder when local set is unhelpful and the
        // query is meaningful (avoids hitting it on every keystroke).
        if (query.length < 4) return
        val task = Runnable { geocodeAsync(query) }
        pendingGeocode = task
        mainHandler.postDelayed(task, 450)   // debounce
    }

    private fun geocodeAsync(query: String) {
        val ctx = context ?: return
        if (!Geocoder.isPresent()) return
        geocoderExecutor.execute {
            val results: List<IndoCity> = try {
                val geocoder = Geocoder(ctx, Locale("id", "ID"))
                @Suppress("DEPRECATION")
                val raw = geocoder.getFromLocationName(query, 5).orEmpty()
                raw.mapNotNull { addr ->
                    val name = addr.locality
                        ?: addr.subAdminArea
                        ?: addr.featureName
                        ?: return@mapNotNull null
                    val prov = addr.adminArea ?: addr.countryName ?: ""
                    val tz = inferTzFromLng(addr.longitude)
                    IndoCity(name, prov, addr.latitude, addr.longitude, tz)
                }
            } catch (e: Exception) {
                emptyList()
            }
            mainHandler.post {
                if (results.isEmpty()) return@post
                // Append after the local matches, de-duplicated by name.
                val existing = adapter.snapshot().map { it.name.lowercase() }.toMutableSet()
                val merged = adapter.snapshot().toMutableList()
                for (r in results) {
                    if (existing.add(r.name.lowercase())) merged.add(r)
                }
                adapter.replaceAll(merged)
                emptyView.visibility = if (merged.isEmpty()) View.VISIBLE else View.GONE
            }
        }
    }

    /**
     * Indonesia spans three IANA zones; rough longitude split:
     *   - WIB  (Asia/Jakarta)   <  ~116.0
     *   - WITA (Asia/Makassar)  ≥ ~116.0 and < ~134.0
     *   - WIT  (Asia/Jayapura)  ≥ ~134.0
     * Outside Indonesia we just default to Asia/Jakarta — the user can
     * adjust manually via the timezone preference if needed.
     */
    private fun inferTzFromLng(lng: Double): String = when {
        lng >= 134.0 -> "Asia/Jayapura"
        lng >= 116.0 -> "Asia/Makassar"
        else         -> "Asia/Jakarta"
    }

    private fun commitCity(city: IndoCity) {
        val pref = preference as? LocationSearchPreference ?: return
        val sp = PreferenceManager.getDefaultSharedPreferences(pref.context)
        sp.edit()
            // Match the existing schema: lat/lng are stored as strings.
            .putString(LocationSearchPreference.K_LAT, city.lat.toString())
            .putString(LocationSearchPreference.K_LNG, city.lng.toString())
            .putString(LocationSearchPreference.K_TZ,  city.timezone)
            .apply()
        // Notify dependent prefs so summaries refresh; the preference
        // screen rebinds on dismissal anyway. We call refreshSummary()
        // which internally calls the protected notifyChanged().
        pref.refreshSummary()
        // Find any sister preferences and rebind their summaries.
        (preferenceFragmentCompat()
            ?.findPreference<Preference>(LocationSearchPreference.K_LAT))
            ?.summary = city.lat.toString()
        (preferenceFragmentCompat()
            ?.findPreference<Preference>(LocationSearchPreference.K_LNG))
            ?.summary = city.lng.toString()
        (preferenceFragmentCompat()
            ?.findPreference<Preference>(LocationSearchPreference.K_TZ))
            ?.let { tzPref ->
                if (tzPref is androidx.preference.ListPreference) {
                    tzPref.value = city.timezone
                } else {
                    tzPref.summary = city.timezone
                }
            }
        dialog?.dismiss()
    }

    private fun preferenceFragmentCompat(): PreferenceFragmentCompat? =
        @Suppress("DEPRECATION") (targetFragment as? PreferenceFragmentCompat)

    override fun onDialogClosed(positiveResult: Boolean) {
        // Tap-to-pick already commits; nothing to do on OK.
    }

    override fun onDestroy() {
        super.onDestroy()
        pendingGeocode?.let { mainHandler.removeCallbacks(it) }
        geocoderExecutor.shutdownNow()
    }

    /** Simple two-line list adapter. */
    private class ResultAdapter(private val ctx: Context) : BaseAdapter() {
        private val data = mutableListOf<IndoCity>()

        fun snapshot(): List<IndoCity> = data.toList()

        fun replaceAll(items: List<IndoCity>) {
            data.clear()
            data.addAll(items)
            notifyDataSetChanged()
        }

        override fun getCount(): Int = data.size
        override fun getItem(position: Int): Any = data[position]
        override fun getItemId(position: Int): Long = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
            val view = convertView ?: LayoutInflater.from(ctx)
                .inflate(android.R.layout.simple_list_item_2, parent, false)
            val item = data[position]
            (view.findViewById<TextView>(android.R.id.text1)).text = item.name
            (view.findViewById<TextView>(android.R.id.text2)).text =
                "${item.province}  ·  ${item.timezone}"
            return view
        }
    }

    companion object {
        fun newInstance(key: String): LocationSearchDialogFragment =
            LocationSearchDialogFragment().apply {
                arguments = Bundle().apply { putString(ARG_KEY, key) }
            }
    }
}


/**
 * Routes location-search clicks from a [PreferenceFragmentCompat]'s
 * onDisplayPreferenceDialog. Mirrors [maybeShowColorPicker] for
 * consistency.
 */
fun PreferenceFragmentCompat.maybeShowLocationSearch(preference: Preference): Boolean {
    if (preference !is LocationSearchPreference) return false
    if (parentFragmentManager.findFragmentByTag(TAG_LOCATION) != null) return true
    val dialog = LocationSearchDialogFragment.newInstance(preference.key)
    @Suppress("DEPRECATION")
    dialog.setTargetFragment(this, 0)
    dialog.show(parentFragmentManager, TAG_LOCATION)
    return true
}

private const val TAG_LOCATION = "id.muslimclock.app.LocationSearchDialog"
