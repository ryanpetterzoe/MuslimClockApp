package id.muslimclock.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
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
                .replace(R.id.settings_container, SettingsFragment())
                .commit()
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    /**
     * Hosts the XML-defined preferences plus two click-only Preferences
     * that drive the slideshow file picker. We register the picker contract
     * once at fragment creation so it survives config changes.
     */
    class SettingsFragment : PreferenceFragmentCompat() {

        private lateinit var pickImagesLauncher: ActivityResultLauncher<Array<String>>
        private lateinit var pickLogoLauncher: ActivityResultLauncher<Array<String>>
        private lateinit var pickAdzanAudioLauncher: ActivityResultLauncher<Array<String>>

        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            // Multi-select picker for both images and videos. We pass two
            // MIME prefixes; ACTION_OPEN_DOCUMENT uses the union, which is
            // what every Android gallery picker supports.
            pickImagesLauncher = registerForActivityResult(
                ActivityResultContracts.OpenMultipleDocuments()
            ) { uris -> if (!uris.isNullOrEmpty()) onImagesPicked(uris) }

            // Single-select picker for the masjid logo. Different contract
            // (OpenDocument, not OpenMultipleDocuments) so users can't
            // accidentally pick five logos at once.
            pickLogoLauncher = registerForActivityResult(
                ActivityResultContracts.OpenDocument()
            ) { uri -> if (uri != null) onLogoPicked(uri) }

            // Single-select picker for the adzan alarm sound. Same contract
            // as the logo picker; only one audio file is active at a time.
            pickAdzanAudioLauncher = registerForActivityResult(
                ActivityResultContracts.OpenDocument()
            ) { uri -> if (uri != null) onAdzanAudioPicked(uri) }
        }

        override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
            setPreferencesFromResource(R.xml.preferences, rootKey)

            findPreference<Preference>("pick_slides")?.setOnPreferenceClickListener {
                pickImagesLauncher.launch(arrayOf("image/*", "video/*"))
                true
            }
            findPreference<Preference>("clear_slides")?.setOnPreferenceClickListener {
                confirmClearSlides()
                true
            }
            findPreference<Preference>("pick_logo")?.setOnPreferenceClickListener {
                // Accept all common image MIME types incl. SVG. We *don't*
                // include svg+xml in the array directly because some
                // pickers misfile it; "image/*" covers it on every device
                // we tested.
                pickLogoLauncher.launch(arrayOf("image/*"))
                true
            }
            findPreference<Preference>("clear_logo")?.setOnPreferenceClickListener {
                confirmClearLogo()
                true
            }
            findPreference<Preference>("pick_adzan_audio")?.setOnPreferenceClickListener {
                // "audio/*" alone is enough on every modern Android — it
                // catches MP3 / M4A / OGG / WAV / FLAC. We don't pass an
                // explicit MIME list because some pickers misfile less
                // common types (e.g. WhatsApp voice notes) and would hide
                // them from the list otherwise.
                pickAdzanAudioLauncher.launch(arrayOf("audio/*"))
                true
            }
            findPreference<Preference>("clear_adzan_audio")?.setOnPreferenceClickListener {
                confirmClearAdzanAudio()
                true
            }
            findPreference<Preference>("reset_layout")?.setOnPreferenceClickListener {
                confirmResetLayout()
                true
            }
            findPreference<Preference>("activate_license")?.setOnPreferenceClickListener {
                showLicenseInputDialog()
                true
            }
            updateClearSummary()
            updateLogoSummary()
            updateAdzanAudioSummary()
            updateLicenseSummary()
        }

        /**
         * Route custom DialogPreference subclasses (color picker) through
         * their own dialog fragments. The default PreferenceFragmentCompat
         * doesn't know how to inflate them, so we intercept here.
         */
        override fun onDisplayPreferenceDialog(preference: Preference) {
            if (maybeShowColorPicker(preference)) return
            super.onDisplayPreferenceDialog(preference)
        }

        /**
         * Plain Preference (non-DialogPreference) clicks come through here.
         * Location search lives on a regular Preference because a
         * DialogPreference forces an AlertDialog with a scrollable container
         * that breaks our inner ListView item-clicks (the original symptom:
         * tapping a city closed the whole SettingsActivity).
         */
        override fun onPreferenceTreeClick(preference: Preference): Boolean {
            if (maybeShowLocationSearch(preference)) return true
            return super.onPreferenceTreeClick(preference)
        }

        private fun onImagesPicked(uris: List<Uri>) {
            val ctx = requireContext()
            // For ACTION_OPEN_DOCUMENT URIs we get a long-lived permission
            // by default, but importing now and persisting our own copy
            // means we don't depend on the source app surviving.
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

        /** Append new URLs to the existing `slideshow_urls` text pref. */
        private fun appendSlides(urls: List<String>) {
            val pref = findPreference<EditTextPreference>(Settings.K_SLIDESHOW_URLS) ?: return
            val existing = pref.text.orEmpty()
            // One URL per line: append after a newline if the field already
            // has content, otherwise just join straight.
            val joined = if (existing.isBlank()) urls.joinToString("\n")
                         else existing.trimEnd() + "\n" + urls.joinToString("\n")
            pref.text = joined
            // Triggering the change listener via setText updates summary +
            // SharedPreferences for us.
        }

        private fun confirmClearSlides() {
            val ctx = requireContext()
            AlertDialog.Builder(ctx)
                .setTitle(R.string.clear_slides_title)
                .setMessage(R.string.clear_slides_message)
                .setPositiveButton(android.R.string.ok) { _, _ ->
                    val n = SlideStorage.clearAll(ctx)
                    // Strip any appassets URLs from the text pref since the
                    // backing files are gone; leave external http(s) URLs.
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

        /**
         * Logo picker callback. Copies the picked image into private
         * storage and writes the resulting `appassets://.../logo/<uuid>`
         * URL straight into the [Settings.K_MASJID_LOGO] EditText pref so
         * the existing JSON config flow picks it up — no extra plumbing.
         *
         * We replace any previous logo (handled inside [LogoStorage]) so
         * uploading a new file always supersedes the old one cleanly.
         */
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

        /**
         * Confirm + wipe the locally stored logo. Also clears the
         * `masjid_logo` preference *iff* it was pointing at our local
         * URL — external http(s) URLs typed in by the user are left
         * alone so we don't surprise them.
         */
        private fun confirmClearLogo() {
            val ctx = requireContext()
            AlertDialog.Builder(ctx)
                .setTitle(R.string.clear_logo_title)
                .setMessage(R.string.clear_logo_message)
                .setPositiveButton(android.R.string.ok) { _, _ ->
                    val removed = LogoStorage.clear(ctx)
                    val pref = findPreference<EditTextPreference>(Settings.K_MASJID_LOGO)
                    if (pref != null && LogoStorage.isLocalLogoUrl(pref.text)) {
                        pref.text = ""
                    }
                    Toast.makeText(
                        ctx,
                        if (removed) R.string.logo_cleared else R.string.logo_nothing_to_clear,
                        Toast.LENGTH_SHORT
                    ).show()
                    updateLogoSummary()
                }
                .setNegativeButton(android.R.string.cancel, null)
                .show()
        }

        /**
         * Show a friendly hint under the "Upload Logo" button so users
         * can tell whether a logo is currently set without diving into
         * the URL field.
         */
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

        /**
         * Adzan audio picker callback. Copies the picked audio into
         * private storage and writes the resulting `appassets://.../audio/<uuid>`
         * URL straight into the [Settings.K_ADZAN_AUDIO_URL] EditText pref so
         * the existing JSON config flow picks it up — the WebView's
         * <audio> element then plays it when adzan triggers.
         *
         * Replaces any previous file (handled inside [AudioStorage]) so
         * uploading a new clip cleanly supersedes the old one.
         */
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

        /**
         * Confirm + wipe the locally stored adzan audio. Also clears the
         * `adzan_audio_url` preference *iff* it was pointing at our local
         * URL — external http(s) URLs typed in by the user are left
         * alone so we don't surprise them.
         */
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

        /**
         * Show a friendly hint under the "Upload Suara Adzan" button so
         * users can tell at a glance whether an alarm sound is currently
         * configured without scrolling down to the URL field.
         */
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

        /**
         * Push every layout-editor key back to its default. Resetting via
         * the hosted [androidx.preference.SeekBarPreference] objects fires
         * each preference's change listener (if any) and refreshes the
         * displayed value, which is what we want — otherwise the slider
         * UI would still show the old number until the user scrolled.
         */
        private fun confirmResetLayout() {
            val ctx = requireContext()
            AlertDialog.Builder(ctx)
                .setTitle(R.string.pref_reset_layout)
                .setMessage(R.string.pref_reset_layout_sum)
                .setPositiveButton(android.R.string.ok) { _, _ ->
                    // Pairs of (pref key, default value). Sizes default to
                    // 100 (%); offsets to 0 (centred / unchanged).
                    val resets = listOf(
                        Settings.K_ANALOG_SIZE   to 100,
                        Settings.K_ANALOG_X_PCT  to 0,
                        Settings.K_ANALOG_Y_PCT  to 0,
                        Settings.K_DIGITAL_SIZE  to 100,
                        Settings.K_DIGITAL_X_PCT to 0,
                        Settings.K_DIGITAL_Y_PCT to 0,
                        Settings.K_PRAYERS_SIZE  to 100,
                        Settings.K_PRAYERS_X_PCT to 0,
                        Settings.K_PRAYERS_Y_PCT to 0,
                        Settings.K_QURAN_SIZE    to 100,
                        Settings.K_QURAN_X_PCT   to 0,
                        Settings.K_QURAN_Y_PCT   to 0,
                        Settings.K_DATE_SIZE     to 100,
                        Settings.K_DATE_X_PCT    to 0,
                        Settings.K_DATE_Y_PCT    to 0,
                        Settings.K_NEXT_SIZE     to 100,
                        Settings.K_NEXT_X_PCT    to 0,
                        Settings.K_NEXT_Y_PCT    to 0,
                        Settings.K_LOGO_SIZE     to 100,
                        Settings.K_IDENTITY_SIZE to 100,
                    )
                    for ((key, def) in resets) {
                        findPreference<androidx.preference.SeekBarPreference>(key)?.value = def
                    }
                    // Reset identity_position ListPreference back to "left"
                    findPreference<androidx.preference.ListPreference>(Settings.K_IDENTITY_POSITION)?.value = "left"
                    // Reset date_position ListPreference back to "auto"
                    findPreference<androidx.preference.ListPreference>(Settings.K_DATE_POSITION)?.value = "auto"
                    Toast.makeText(ctx, R.string.layout_reset_done, Toast.LENGTH_SHORT).show()
                }
                .setNegativeButton(android.R.string.cancel, null)
                .show()
        }

        /**
         * Show a dialog for the user to enter their license code.
         * On OK, calls [LicenseManager.activate] and updates prefs on success.
         */
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

                    // Capture application context so callback works even
                    // if the fragment/activity is gone by the time Firebase
                    // responds (which explains the "stuck at validating" bug).
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

        /**
         * Update the "Aktivasi Lisensi" summary to show current status.
         */
        private fun updateLicenseSummary() {
            val ctx = context ?: return
            val isPro = Settings.prefs(ctx).getBoolean(Settings.K_IS_PRO, false)
            findPreference<Preference>("activate_license")?.summary =
                if (isPro) ctx.getString(R.string.pref_activate_license_sum_pro)
                else ctx.getString(R.string.pref_activate_license_sum)
        }
    }
}
