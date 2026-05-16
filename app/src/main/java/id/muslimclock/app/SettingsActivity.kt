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

        override fun onCreate(savedInstanceState: Bundle?) {
            super.onCreate(savedInstanceState)
            // Multi-select image picker. ACTION_OPEN_DOCUMENT under the
            // hood — gives us a content:// URI we can immediately copy.
            pickImagesLauncher = registerForActivityResult(
                ActivityResultContracts.OpenMultipleDocuments()
            ) { uris -> if (!uris.isNullOrEmpty()) onImagesPicked(uris) }
        }

        override fun onCreatePreferences(savedInstanceState: Bundle?, rootKey: String?) {
            setPreferencesFromResource(R.xml.preferences, rootKey)

            findPreference<Preference>("pick_slides")?.setOnPreferenceClickListener {
                pickImagesLauncher.launch(arrayOf("image/*"))
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
    }
}
