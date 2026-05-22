package id.muslimclock.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.GridLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import androidx.preference.EditTextPreference
import androidx.preference.Preference
import androidx.preference.PreferenceFragmentCompat

class SettingsActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        title = getString(R.string.settings_title)

        if (savedInstanceState == null) {
            supportFragmentManager.beginTransaction()
                .replace(R.id.settings_container, SettingsGridFragment())
                .commit()
        }

        supportFragmentManager.addOnBackStackChangedListener {
            if (supportFragmentManager.backStackEntryCount == 0) {
                title = getString(R.string.settings_title)
            }
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        if (supportFragmentManager.backStackEntryCount > 0) {
            supportFragmentManager.popBackStack()
            return true
        }
        finish()
        return true
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (supportFragmentManager.backStackEntryCount > 0) {
            supportFragmentManager.popBackStack()
        } else {
            super.onBackPressed()
        }
    }

    private fun navigateTo(fragment: Fragment, titleRes: Int) {
        title = getString(titleRes)
        supportFragmentManager.beginTransaction()
            .replace(R.id.settings_container, fragment)
            .addToBackStack(null)
            .commit()
    }

    // =========================================================================
    // Grid Fragment
    // =========================================================================

    class SettingsGridFragment : Fragment() {

        private data class CardItem(
            val titleRes: Int,
            val iconRes: Int,
            val action: () -> Unit
        )

        override fun onCreateView(
            inflater: LayoutInflater,
            container: ViewGroup?,
            savedInstanceState: Bundle?
        ): View? {
            return inflater.inflate(R.layout.fragment_settings_grid, container, false)
        }

        override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
            super.onViewCreated(view, savedInstanceState)
            val activity = requireActivity() as SettingsActivity
            val grid = view.findViewById<GridLayout>(R.id.settings_grid)

            val items = listOf(
                CardItem(R.string.grid_masjid, R.drawable.ic_settings_masjid) {
                    activity.navigateTo(MasjidSettingsFragment(), R.string.grid_masjid)
                },
                CardItem(R.string.grid_location, R.drawable.ic_settings_location) {
                    activity.navigateTo(LocationSettingsFragment(), R.string.grid_location)
                },
                CardItem(R.string.grid_appearance, R.drawable.ic_settings_appearance) {
                    activity.navigateTo(AppearanceSettingsFragment(), R.string.grid_appearance)
                },
                CardItem(R.string.grid_feature, R.drawable.ic_settings_feature) {
                    activity.navigateTo(FeatureSettingsFragment(), R.string.grid_feature)
                },
                CardItem(R.string.grid_slideshow, R.drawable.ic_settings_slideshow) {
                    activity.navigateTo(SlideshowSettingsFragment(), R.string.grid_slideshow)
                },
                CardItem(R.string.grid_imam, R.drawable.ic_settings_imam) {
                    activity.navigateTo(ImamSettingsFragment(), R.string.grid_imam)
                },
                CardItem(R.string.grid_editor, R.drawable.ic_settings_editor) {
                    startActivity(Intent(requireContext(), LayoutEditorActivity::class.java))
                },
                CardItem(R.string.grid_adzan, R.drawable.ic_settings_adzan) {
                    activity.navigateTo(AdzanSettingsFragment(), R.string.grid_adzan)
                },
                CardItem(R.string.grid_system, R.drawable.ic_settings_system) {
                    activity.navigateTo(SystemSettingsFragment(), R.string.grid_system)
                }
            )

            val inflater = LayoutInflater.from(requireContext())
            for ((index, item) in items.withIndex()) {
                val card = inflater.inflate(R.layout.item_settings_card, grid, false) as LinearLayout
                card.findViewById<ImageView>(R.id.card_icon).setImageResource(item.iconRes)
                card.findViewById<TextView>(R.id.card_title).text = getString(item.titleRes)
                card.setOnClickListener { item.action() }

                val params = GridLayout.LayoutParams().apply {
                    width = 0
                    height = GridLayout.LayoutParams.WRAP_CONTENT
                    columnSpec = GridLayout.spec(index % 3, 1f)
                    rowSpec = GridLayout.spec(index / 3)
                    setMargins(8, 8, 8, 8)
                }
                grid.addView(card, params)
            }
        }
    }

    // =========================================================================
    // Masjid Settings
    // =========================================================================

    class MasjidSettingsFragment : PreferenceFragmentCompat() {

        private lateinit var pickLogoLauncher: ActivityResultLauncher<Array<String>>

        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            pickLogoLauncher = registerForActivityResult(
                ActivityResultContracts.OpenDocument()
            ) { uri -> if (uri != null) onLogoPicked(uri) }
        }

        override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
            setPreferencesFromResource(R.xml.pref_masjid, rootKey)

            findPreference<Preference>("pick_logo")?.setOnPreferenceClickListener {
                pickLogoLauncher.launch(arrayOf("image/*"))
                true
            }
            findPreference<Preference>("clear_logo")?.setOnPreferenceClickListener {
                confirmClearLogo()
                true
            }
            updateLogoSummary()
        }

        private fun onLogoPicked(uri: Uri) {
            val ctx = requireContext()
            val url = LogoStorage.importLogo(ctx, uri)
            if (url == null) {
                Toast.makeText(ctx, R.string.logo_import_failed, Toast.LENGTH_LONG).show()
                return
            }
            findPreference<EditTextPreference>(Settings.K_MASJID_LOGO)?.text = url
            Toast.makeText(ctx, R.string.logo_imported, Toast.LENGTH_SHORT).show()
            updateLogoSummary()
        }

        private fun confirmClearLogo() {
            val ctx = requireContext()
            AlertDialog.Builder(ctx)
                .setTitle(R.string.clear_logo_title)
                .setMessage(R.string.clear_logo_message)
                .setPositiveButton(android.R.string.ok) { _, _ ->
                    LogoStorage.clear(ctx)
                    val pref = findPreference<EditTextPreference>(Settings.K_MASJID_LOGO)
                    if (pref != null && LogoStorage.isLocalLogoUrl(pref.text)) {
                        pref.text = ""
                    }
                    Toast.makeText(
                        ctx,
                        if (LogoStorage.clear(ctx)) R.string.logo_cleared
                        else R.string.logo_nothing_to_clear,
                        Toast.LENGTH_SHORT
                    ).show()
                    updateLogoSummary()
                }
                .setNegativeButton(android.R.string.cancel, null)
                .show()
        }

        private fun updateLogoSummary() {
            val ctx = context ?: return
            val current = Settings.prefs(ctx).getString(Settings.K_MASJID_LOGO, "").orEmpty()
            findPreference<Preference>("pick_logo")?.summary = when {
                current.isBlank() ->
                    ctx.getString(R.string.pref_pick_logo_sum_empty)
                LogoStorage.isLocalLogoUrl(current) ->
                    ctx.getString(R.string.pref_pick_logo_sum_local)
                else ->
                    ctx.getString(R.string.pref_pick_logo_sum_url)
            }
        }
    }

    // =========================================================================
    // Location Settings
    // =========================================================================

    class LocationSettingsFragment : PreferenceFragmentCompat() {

        override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
            setPreferencesFromResource(R.xml.pref_location, rootKey)
        }

        override fun onPreferenceTreeClick(preference: Preference): Boolean {
            if (maybeShowLocationSearch(preference)) return true
            return super.onPreferenceTreeClick(preference)
        }
    }

    // =========================================================================
    // Appearance Settings
    // =========================================================================

    class AppearanceSettingsFragment : PreferenceFragmentCompat() {

        override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
            setPreferencesFromResource(R.xml.pref_appearance, rootKey)
        }

        override fun onDisplayPreferenceDialog(preference: Preference) {
            if (maybeShowColorPicker(preference)) return
            super.onDisplayPreferenceDialog(preference)
        }
    }

    // =========================================================================
    // Feature Settings (Running Text + Quran)
    // =========================================================================

    class FeatureSettingsFragment : PreferenceFragmentCompat() {

        override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
            setPreferencesFromResource(R.xml.pref_feature, rootKey)
        }
    }

    // =========================================================================
    // Slideshow Settings
    // =========================================================================

    class SlideshowSettingsFragment : PreferenceFragmentCompat() {

        private lateinit var pickImagesLauncher: ActivityResultLauncher<Array<String>>

        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            pickImagesLauncher = registerForActivityResult(
                ActivityResultContracts.OpenMultipleDocuments()
            ) { uris -> if (!uris.isNullOrEmpty()) onImagesPicked(uris) }
        }

        override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
            setPreferencesFromResource(R.xml.pref_slideshow, rootKey)

            findPreference<Preference>("pick_slides")?.setOnPreferenceClickListener {
                pickImagesLauncher.launch(arrayOf("image/*", "video/*"))
                true
            }
            findPreference<Preference>("clear_slides")?.setOnPreferenceClickListener {
                confirmClearSlides()
                true
            }
            updateClearSummary()
        }

        private fun onImagesPicked(uris: List<Uri>) {
            val ctx = requireContext()
            val imported = mutableListOf<String>()
            val rejected = mutableListOf<Uri>()
            for (uri in uris) {
                val url = SlideStorage.importImage(ctx, uri)
                if (url != null) imported.add(url) else rejected.add(uri)
            }

            if (imported.isNotEmpty()) {
                appendSlides(imported)
                Toast.makeText(
                    ctx,
                    getString(R.string.slides_imported_count, imported.size),
                    Toast.LENGTH_SHORT
                ).show()
            }
            if (rejected.isNotEmpty()) {
                Toast.makeText(
                    ctx,
                    getString(R.string.slides_rejected_count, rejected.size),
                    Toast.LENGTH_LONG
                ).show()
            }
            updateClearSummary()
        }

        private fun appendSlides(urls: List<String>) {
            val pref = findPreference<EditTextPreference>(Settings.K_SLIDESHOW_URLS) ?: return
            val existing = pref.text.orEmpty()
            val joined = if (existing.isBlank()) urls.joinToString("\n")
                         else existing.trimEnd() + "\n" + urls.joinToString("\n")
            pref.text = joined
        }

        private fun confirmClearSlides() {
            val ctx = requireContext()
            AlertDialog.Builder(ctx)
                .setTitle(R.string.clear_slides_title)
                .setMessage(R.string.clear_slides_message)
                .setPositiveButton(android.R.string.ok) { _, _ ->
                    val n = SlideStorage.clearAll(ctx)
                    findPreference<EditTextPreference>(Settings.K_SLIDESHOW_URLS)?.let { p ->
                        val keep = (p.text ?: "")
                            .lineSequence()
                            .map { it.trim() }
                            .filter { it.isNotEmpty() && !it.startsWith(SlideStorage.URL_PREFIX) }
                            .toList()
                        p.text = keep.joinToString("\n")
                    }
                    Toast.makeText(
                        ctx,
                        getString(R.string.slides_cleared_count, n),
                        Toast.LENGTH_SHORT
                    ).show()
                    updateClearSummary()
                }
                .setNegativeButton(android.R.string.cancel, null)
                .show()
        }

        private fun updateClearSummary() {
            val ctx = context ?: return
            val files = SlideStorage.dir(ctx).listFiles()?.size ?: 0
            findPreference<Preference>("clear_slides")?.summary =
                resources.getQuantityString(R.plurals.stored_slides_count, files, files)
        }
    }

    // =========================================================================
    // Imam Settings
    // =========================================================================

    class ImamSettingsFragment : PreferenceFragmentCompat() {

        override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
            setPreferencesFromResource(R.xml.pref_imam, rootKey)
        }
    }

    // =========================================================================
    // Adzan Settings
    // =========================================================================

    class AdzanSettingsFragment : PreferenceFragmentCompat() {

        private lateinit var pickAdzanAudioLauncher: ActivityResultLauncher<Array<String>>

        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            pickAdzanAudioLauncher = registerForActivityResult(
                ActivityResultContracts.OpenDocument()
            ) { uri -> if (uri != null) onAdzanAudioPicked(uri) }
        }

        override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
            setPreferencesFromResource(R.xml.pref_adzan, rootKey)

            findPreference<Preference>("pick_adzan_audio")?.setOnPreferenceClickListener {
                pickAdzanAudioLauncher.launch(arrayOf("audio/*"))
                true
            }
            findPreference<Preference>("clear_adzan_audio")?.setOnPreferenceClickListener {
                confirmClearAdzanAudio()
                true
            }
            updateAdzanAudioSummary()
        }

        private fun onAdzanAudioPicked(uri: Uri) {
            val ctx = requireContext()
            val url = AudioStorage.importAudio(ctx, uri)
            if (url == null) {
                Toast.makeText(ctx, R.string.adzan_audio_import_failed, Toast.LENGTH_LONG).show()
                return
            }
            findPreference<EditTextPreference>(Settings.K_ADZAN_AUDIO_URL)?.text = url
            Toast.makeText(ctx, R.string.adzan_audio_imported, Toast.LENGTH_SHORT).show()
            updateAdzanAudioSummary()
        }

        private fun confirmClearAdzanAudio() {
            val ctx = requireContext()
            AlertDialog.Builder(ctx)
                .setTitle(R.string.clear_adzan_audio_title)
                .setMessage(R.string.clear_adzan_audio_message)
                .setPositiveButton(android.R.string.ok) { _, _ ->
                    val removed = AudioStorage.clear(ctx)
                    val pref = findPreference<EditTextPreference>(Settings.K_ADZAN_AUDIO_URL)
                    if (pref != null && AudioStorage.isLocalAudioUrl(pref.text)) {
                        pref.text = ""
                    }
                    Toast.makeText(
                        ctx,
                        if (removed) R.string.adzan_audio_cleared
                        else R.string.adzan_audio_nothing_to_clear,
                        Toast.LENGTH_SHORT
                    ).show()
                    updateAdzanAudioSummary()
                }
                .setNegativeButton(android.R.string.cancel, null)
                .show()
        }

        private fun updateAdzanAudioSummary() {
            val ctx = context ?: return
            val current = Settings.prefs(ctx).getString(Settings.K_ADZAN_AUDIO_URL, "").orEmpty()
            findPreference<Preference>("pick_adzan_audio")?.summary = when {
                current.isBlank() ->
                    ctx.getString(R.string.pref_pick_adzan_audio_sum_empty)
                AudioStorage.isLocalAudioUrl(current) ->
                    ctx.getString(R.string.pref_pick_adzan_audio_sum_local)
                else ->
                    ctx.getString(R.string.pref_pick_adzan_audio_sum_url)
            }
        }
    }

    // =========================================================================
    // System Settings
    // =========================================================================

    class SystemSettingsFragment : PreferenceFragmentCompat() {

        override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
            setPreferencesFromResource(R.xml.pref_system, rootKey)

            findPreference<Preference>("activate_license")?.setOnPreferenceClickListener {
                showLicenseInputDialog()
                true
            }
            updateLicenseSummary()
        }

        private fun showLicenseInputDialog() {
            val ctx = requireContext()
            val isPro = Settings.prefs(ctx).getBoolean(Settings.K_IS_PRO, false)
            if (isPro) {
                Toast.makeText(ctx, R.string.pref_activate_license_sum_pro, Toast.LENGTH_SHORT).show()
                return
            }

            val input = android.widget.EditText(ctx).apply {
                hint = ctx.getString(R.string.license_input_hint)
                isSingleLine = true
                inputType = android.text.InputType.TYPE_CLASS_TEXT or
                    android.text.InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
                setPadding(48, 32, 48, 32)
            }

            AlertDialog.Builder(ctx)
                .setTitle(R.string.license_input_title)
                .setView(input)
                .setPositiveButton(android.R.string.ok) { _, _ ->
                    val code = input.text.toString().trim()
                    if (code.isEmpty()) return@setPositiveButton

                    Toast.makeText(ctx, R.string.license_activating, Toast.LENGTH_SHORT).show()

                    val appCtx = ctx.applicationContext
                    val handler = android.os.Handler(android.os.Looper.getMainLooper())

                    LicenseManager.activate(ctx, code) { result ->
                        handler.post {
                            when (result) {
                                LicenseManager.Result.SUCCESS -> {
                                    Settings.prefs(appCtx).edit()
                                        .putBoolean(Settings.K_IS_PRO, true)
                                        .putString(Settings.K_LICENSE_KEY, code.uppercase())
                                        .apply()
                                    Toast.makeText(appCtx, R.string.license_success, Toast.LENGTH_LONG).show()
                                    try { updateLicenseSummary() } catch (_: Throwable) {}
                                }
                                LicenseManager.Result.ERROR_INVALID ->
                                    Toast.makeText(appCtx, R.string.license_error_invalid, Toast.LENGTH_LONG).show()
                                LicenseManager.Result.ERROR_USED ->
                                    Toast.makeText(appCtx, R.string.license_error_used, Toast.LENGTH_LONG).show()
                                LicenseManager.Result.ERROR_NETWORK ->
                                    Toast.makeText(appCtx, R.string.license_error_network, Toast.LENGTH_LONG).show()
                            }
                        }
                    }
                }
                .setNegativeButton(android.R.string.cancel, null)
                .show()
        }

        private fun updateLicenseSummary() {
            val ctx = context ?: return
            val isPro = Settings.prefs(ctx).getBoolean(Settings.K_IS_PRO, false)
            findPreference<Preference>("activate_license")?.summary =
                if (isPro) ctx.getString(R.string.pref_activate_license_sum_pro)
                else ctx.getString(R.string.pref_activate_license_sum)
        }
    }
}
