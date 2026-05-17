package id.muslimclock.app

import android.app.Dialog
import android.content.Context
import android.location.Geocoder
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
import android.view.Window
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import androidx.fragment.app.DialogFragment
import androidx.preference.EditTextPreference
import androidx.preference.ListPreference
import androidx.preference.Preference
import androidx.preference.PreferenceFragmentCompat
import androidx.preference.PreferenceManager
import java.util.Locale
import java.util.concurrent.Executors

/**
 * A "pick a city" preference. Clicking the row opens a custom DialogFragment
 * that lets the user search Indonesian cities and (optionally) fall back to
 * the device geocoder. When the user picks a result, lat / lng / timezone
 * are written together to the same SharedPreferences keys other prefs read.
 *
 * We deliberately do NOT extend [DialogPreference] / use
 * [PreferenceDialogFragmentCompat]. That path wraps our content in an
 * AlertDialog with a forced scrollable container plus OK/Cancel buttons —
 * the nested-scroll interaction with our inner ListView swallows / mis-routes
 * row clicks, which on the original implementation made tapping a result
 * dismiss the dialog AND finish SettingsActivity, dumping the user back to
 * the clock screen. Owning the dialog ourselves avoids that entire mess.
 */
class LocationSearchPreference @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = androidx.preference.R.attr.preferenceStyle,
    defStyleRes: Int = 0
) : Preference(context, attrs, defStyleAttr, defStyleRes) {

    companion object {
        const val K_LAT = Settings.K_LAT
        const val K_LNG = Settings.K_LNG
        const val K_TZ  = Settings.K_TIMEZONE
    }

    init {
        // Preference is purely a launcher — value lives in lat/lng/tz prefs.
        isPersistent = false
    }

    /** Renders summary based on the currently saved lat/lng/timezone. */
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
 * Standalone DialogFragment that hosts the picker UI. Returned from
 * [maybeShowLocationSearch] when the host PreferenceFragment intercepts the
 * click. We hold a reference to the host fragment so that on commit we can
 * call the proper Preference setters (which keeps summaries / dependents in
 * sync without us having to mutate them by hand).
 */
class LocationSearchDialogFragment : DialogFragment() {

    private val mainHandler = Handler(Looper.getMainLooper())
    private val geocoderExecutor = Executors.newSingleThreadExecutor()
    private var pendingGeocode: Runnable? = null

    private lateinit var adapter: ResultAdapter
    private lateinit var emptyView: TextView

    /**
     * Host PreferenceFragment. Cached at attach time so we can flow
     * the picked city into its bound EditTextPreference / ListPreference
     * objects directly (which fires their own change listeners). This
     * avoids the brittle targetFragment dance the old version used.
     */
    private var hostFragmentRef: PreferenceFragmentCompat? = null

    fun bindHost(host: PreferenceFragmentCompat) {
        hostFragmentRef = host
    }

    override fun onCreateDialog(savedInstanceState: Bundle?): Dialog {
        // A bare Dialog so we get a normal window — no AlertDialog scroll
        // container, no implicit OK/Cancel buttons, no fight with ListView.
        val dialog = Dialog(requireContext(), theme)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        dialog.setTitle(getString(R.string.pref_location_search))
        return dialog
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val ctx = requireContext()
        val density = ctx.resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        val root = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF1E1E1E.toInt())
            setPadding(dp(20), dp(16), dp(20), dp(16))
            // Fill the dialog window so the ListView gets real height.
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }

        val title = TextView(ctx).apply {
            text = ctx.getString(R.string.pref_location_search)
            textSize = 18f
            setTextColor(0xFFFFFFFF.toInt())
            setPadding(0, 0, 0, dp(8))
        }
        root.addView(title)

        val searchInput = EditText(ctx).apply {
            hint = ctx.getString(R.string.pref_location_search_hint)
            isSingleLine = true
            setTextColor(0xFFFFFFFF.toInt())
            setHintTextColor(0xFF999999.toInt())
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        }
        root.addView(searchInput)

        val listView = ListView(ctx).apply {
            // Visible divider helps the user identify rows on dark themes.
            divider = null
            isClickable = true
            isFocusable = true
            // The 1f weight lets the ListView consume all remaining vertical
            // space inside the LinearLayout, which is essential — otherwise
            // it ends up 0px tall and clicks land on the underlying scrim.
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            ).apply { topMargin = dp(8) }
        }
        adapter = ResultAdapter(ctx)
        listView.adapter = adapter
        listView.setOnItemClickListener { _, _, position, _ ->
            val item = adapter.getItem(position) as? IndoCity ?: return@setOnItemClickListener
            commitCity(item)
        }
        root.addView(listView)

        emptyView = TextView(ctx).apply {
            text = ctx.getString(R.string.pref_location_search_empty)
            gravity = Gravity.CENTER
            setPadding(0, dp(16), 0, 0)
            visibility = View.GONE
            setTextColor(0xFF999999.toInt())
        }
        root.addView(emptyView)

        // Initial population: full curated list.
        adapter.replaceAll(IndonesianCities.search("", limit = 80))

        searchInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                runSearch(s?.toString().orEmpty())
            }
        })

        return root
    }

    override fun onStart() {
        super.onStart()
        // Make the dialog occupy a usable portion of the screen — default
        // wrap_content from Dialog gives us a tiny stub that the ListView
        // can't scroll inside.
        dialog?.window?.setLayout(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
    }

    private fun runSearch(query: String) {
        val local = IndonesianCities.search(query, limit = 80)
        adapter.replaceAll(local)
        emptyView.visibility = if (local.isEmpty()) View.VISIBLE else View.GONE

        pendingGeocode?.let { mainHandler.removeCallbacks(it) }
        pendingGeocode = null

        if (query.length < 4) return
        val task = Runnable { geocodeAsync(query) }
        pendingGeocode = task
        mainHandler.postDelayed(task, 450)
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
                if (results.isEmpty() || !isAdded) return@post
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

    private fun inferTzFromLng(lng: Double): String = when {
        lng >= 134.0 -> "Asia/Jayapura"
        lng >= 116.0 -> "Asia/Makassar"
        else         -> "Asia/Jakarta"
    }

    /**
     * Persist the picked city. We:
     *   1. Write SharedPreferences directly (atomic group commit).
     *   2. Push the same values into the host PreferenceFragment's
     *      bound prefs so summaries / dependent UI refresh immediately
     *      and the framework's change listeners fire correctly.
     *   3. Dismiss this DialogFragment — the host SettingsActivity is
     *      untouched and stays in front of the user.
     */
    private fun commitCity(city: IndoCity) {
        val ctx = context ?: return
        val sp = PreferenceManager.getDefaultSharedPreferences(ctx)
        sp.edit()
            .putString(LocationSearchPreference.K_LAT, city.lat.toString())
            .putString(LocationSearchPreference.K_LNG, city.lng.toString())
            .putString(LocationSearchPreference.K_TZ,  city.timezone)
            .apply()

        // Sync the visible Preference objects so the summaries (which use
        // useSimpleSummaryProvider) update without waiting for a rebind.
        // Each setter is wrapped individually so a failure (e.g. TZ value
        // not in the ListPreference's entries) doesn't blow up the others.
        val host = hostFragmentRef
        if (host != null && host.isAdded) {
            runCatching {
                (host.findPreference<EditTextPreference>(LocationSearchPreference.K_LAT))
                    ?.text = city.lat.toString()
            }
            runCatching {
                (host.findPreference<EditTextPreference>(LocationSearchPreference.K_LNG))
                    ?.text = city.lng.toString()
            }
            runCatching {
                val tzPref = host.findPreference<Preference>(LocationSearchPreference.K_TZ)
                if (tzPref is ListPreference) {
                    // ListPreference.value silently no-ops if outside entries;
                    // verify before assigning so we don't leave a stale value.
                    val entries = tzPref.entryValues?.map { it.toString() } ?: emptyList()
                    if (city.timezone in entries) {
                        tzPref.value = city.timezone
                    } else {
                        tzPref.summary = city.timezone
                    }
                } else {
                    tzPref?.summary = city.timezone
                }
            }
            // Re-bind the location-search preference so its summary picks
            // up the new lat/lng/tz immediately.
            runCatching {
                host.findPreference<LocationSearchPreference>("location_picker")
                    ?.notifyChanged()
            }
        }
        dismissAllowingStateLoss()
    }

    override fun onDestroy() {
        super.onDestroy()
        pendingGeocode?.let { mainHandler.removeCallbacks(it) }
        geocoderExecutor.shutdownNow()
    }

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
            (view.findViewById<TextView>(android.R.id.text1)).apply {
                text = item.name
                setTextColor(0xFFFFFFFF.toInt())
            }
            (view.findViewById<TextView>(android.R.id.text2)).apply {
                text = "${item.province}  ·  ${item.timezone}"
                setTextColor(0xFFAAAAAA.toInt())
            }
            return view
        }
    }
}

/**
 * Helper that extends Preference's tiny notify-changed surface for
 * subclasses outside this package can't otherwise reach.
 */
private fun LocationSearchPreference.notifyChanged() {
    // Re-emit the current summary so PreferenceFragment rebinds the view.
    val s = summary
    summary = if (s.isNullOrEmpty()) " " else s
    summary = s
}

/**
 * Routes location-search clicks from a [PreferenceFragmentCompat]'s
 * preference click. Returns true if the click was handled.
 */
fun PreferenceFragmentCompat.maybeShowLocationSearch(preference: Preference): Boolean {
    if (preference !is LocationSearchPreference) return false
    if (parentFragmentManager.findFragmentByTag(TAG_LOCATION) != null) return true
    val dialog = LocationSearchDialogFragment().apply { bindHost(this@maybeShowLocationSearch) }
    dialog.show(parentFragmentManager, TAG_LOCATION)
    return true
}

private const val TAG_LOCATION = "id.muslimclock.app.LocationSearchDialog"
