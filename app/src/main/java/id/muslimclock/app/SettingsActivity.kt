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
            findPreference<Preference>("reset_layout")?.setOnPreferenceClickListener {
                confirmResetLayout()
                true
            }
            updateClearSummary()
            updateLogoSummary()
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
                    )
                    for ((key, def) in resets) {
                        findPreference<androidx.preference.SeekBarPreference>(key)?.value = def
                    }
                    Toast.makeText(ctx, R.string.layout_reset_done, Toast.LENGTH_SHORT).show()
                }
                .setNegativeButton(android.R.string.cancel, null)
                .show()
        }
    }
}
