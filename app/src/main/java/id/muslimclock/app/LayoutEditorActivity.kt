package id.muslimclock.app

import android.annotation.SuppressLint
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

/**
 * A dedicated layout editor with a **live preview**. The screen is split:
 * - Top: a WebView showing the actual clock layout (same as MainActivity)
 * - Bottom: element tabs + seekbar sliders for size / X / Y
 *
 * Every slider change immediately pushes the updated config JSON to the
 * preview WebView so the user sees the result in real-time — no more
 * back-and-forth between Settings and the main screen.
 */
class LayoutEditorActivity : AppCompatActivity() {

    private lateinit var previewWebView: WebView
    private lateinit var assetLoader: WebViewAssetLoader
    private lateinit var controlPanel: LinearLayout
    private lateinit var elementTabs: LinearLayout
    private lateinit var sliderContainer: LinearLayout

    // The elements the user can reposition, in display order.
    data class EditableElement(
        val label: String,
        val sizeKey: String,
        val xKey: String,
        val yKey: String,
        val sizeMin: Int = 50,
        val sizeMax: Int = 200,
        val sizeStep: Int = 5,
        val offsetMin: Int = -50,
        val offsetMax: Int = 50
    )

    private val elements = listOf(
        EditableElement("Jam Digital", Settings.K_DIGITAL_SIZE, Settings.K_DIGITAL_X_PCT, Settings.K_DIGITAL_Y_PCT),
        EditableElement("Jam Analog", Settings.K_ANALOG_SIZE, Settings.K_ANALOG_X_PCT, Settings.K_ANALOG_Y_PCT),
        EditableElement("Jadwal Sholat", Settings.K_PRAYERS_SIZE, Settings.K_PRAYERS_X_PCT, Settings.K_PRAYERS_Y_PCT),
        EditableElement("Menuju Sholat", Settings.K_NEXT_SIZE, Settings.K_NEXT_X_PCT, Settings.K_NEXT_Y_PCT),
        EditableElement("Tanggal", Settings.K_DATE_SIZE, Settings.K_DATE_X_PCT, Settings.K_DATE_Y_PCT),
        EditableElement("Qur'an", Settings.K_QURAN_SIZE, Settings.K_QURAN_X_PCT, Settings.K_QURAN_Y_PCT),
        EditableElement("Identitas", Settings.K_IDENTITY_SIZE, Settings.K_IDENTITY_X_PCT, Settings.K_IDENTITY_Y_PCT,
            sizeMin = 50, sizeMax = 200),
    )

    private var selectedElementIdx = 0
    private var tabButtons = mutableListOf<Button>()

    // Local working copy of layout values (written to SharedPreferences on Done)
    private val workingValues = mutableMapOf<String, Int>()
    // Local working copy of string-type settings (dropdowns)
    private val workingStrings = mutableMapOf<String, String>()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Hide action bar — we use a fullscreen overlay approach
        supportActionBar?.hide()
        setContentView(R.layout.activity_layout_editor)

        controlPanel = findViewById(R.id.control_panel)
        elementTabs = findViewById(R.id.element_tabs)
        sliderContainer = findViewById(R.id.slider_container)

        // Load current values from prefs into working map
        loadWorkingValues()

        // Setup WebView
        setupPreviewWebView()

        // Build tabs
        buildElementTabs()

        // Show first element's sliders
        showSlidersForElement(0)

        // Buttons
        val btnReset = findViewById<Button>(R.id.btn_reset)
        val btnDone = findViewById<Button>(R.id.btn_done)
        btnReset.setOnClickListener { confirmReset() }
        btnDone.setOnClickListener { saveAndFinish() }

        // Focus highlight for remote navigation on action buttons
        val focusHighlight = View.OnFocusChangeListener { v, hasFocus ->
            val btn = v as Button
            if (hasFocus) {
                btn.scaleX = 1.1f
                btn.scaleY = 1.1f
                btn.alpha = 1.0f
            } else {
                btn.scaleX = 1.0f
                btn.scaleY = 1.0f
                btn.alpha = 0.85f
            }
        }
        btnReset.onFocusChangeListener = focusHighlight
        btnDone.onFocusChangeListener = focusHighlight

        // Tap the preview area (outside panel) to toggle panel visibility
        previewWebView.setOnTouchListener { _, event ->
            if (event.action == android.view.MotionEvent.ACTION_UP) {
                // Only toggle if tap is outside the panel area
                val panelLeft = controlPanel.left
                if (event.x < panelLeft) {
                    togglePanel()
                }
            }
            false // let WebView handle the touch normally
        }
    }

    private fun loadWorkingValues() {
        val p = Settings.prefs(this)
        // Load all layout editor int keys
        val allKeys = elements.flatMap { listOf(it.sizeKey, it.xKey, it.yKey) }.distinct().toMutableList()
        // Also load logo_size since it appears in the Identitas tab
        allKeys.add(Settings.K_LOGO_SIZE)
        for (key in allKeys) {
            val default = if (key.endsWith("_size")) 100 else 0
            workingValues[key] = try {
                p.getInt(key, default)
            } catch (_: Throwable) {
                default
            }
        }
        // Load string-type settings for dropdowns
        workingStrings[Settings.K_DIGITAL_STYLE] = p.getString(Settings.K_DIGITAL_STYLE, "classic") ?: "classic"
        workingStrings[Settings.K_IDENTITY_POSITION] = p.getString(Settings.K_IDENTITY_POSITION, "left") ?: "left"
        workingStrings[Settings.K_LOGO_POSITION] = p.getString(Settings.K_LOGO_POSITION, "right") ?: "right"
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupPreviewWebView() {
        previewWebView = findViewById(R.id.preview_webview)

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .addPathHandler("/slides/", WebViewAssetLoader.InternalStoragePathHandler(this, SlideStorage.dir(this)))
            .addPathHandler("/logo/", WebViewAssetLoader.InternalStoragePathHandler(this, LogoStorage.dir(this)))
            .addPathHandler("/audio/", WebViewAssetLoader.InternalStoragePathHandler(this, AudioStorage.dir(this)))
            .build()

        previewWebView.apply {
            setBackgroundColor(0xFF000000.toInt())
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                @Suppress("DEPRECATION")
                databaseEnabled = true
                cacheMode = WebSettings.LOAD_DEFAULT
                mediaPlaybackRequiresUserGesture = true
                loadWithOverviewMode = true
                useWideViewPort = true
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                allowFileAccess = false
                allowContentAccess = false
            }

            // Provide a bridge so the page can read config
            addJavascriptInterface(LayoutEditorBridge(), "MCAndroid")

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    pushConfigToPreview()
                }
            }
            webChromeClient = WebChromeClient()
        }

        previewWebView.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
    }

    /**
     * Minimal bridge for the preview WebView. Returns the full config JSON
     * with working (unsaved) layout values overlaid on top.
     */
    inner class LayoutEditorBridge {
        @android.webkit.JavascriptInterface
        fun getConfig(): String = buildPreviewJson()

        @android.webkit.JavascriptInterface
        fun openSettings() {
            // no-op in editor mode
        }
    }

    /**
     * Build the full config JSON but override layout-editor keys with
     * the current working (in-memory) values.
     */
    private fun buildPreviewJson(): String {
        // Start with the real saved config
        val baseJson = Settings.toJson(this)
        val json = JSONObject(baseJson)
        // Override layout keys with working int values
        for ((key, value) in workingValues) {
            json.put(key, value)
        }
        // Override layout keys with working string values
        for ((key, value) in workingStrings) {
            json.put(key, value)
        }
        return json.toString()
    }

    /**
     * Push updated config to the WebView immediately.
     */
    private fun pushConfigToPreview() {
        val json = buildPreviewJson()
        val escaped = JSONObject.quote(json)
        val js = "if (window.applyConfig) { window.applyConfig(JSON.parse($escaped)); } " +
                "else { window.MC_CONFIG = JSON.parse($escaped); }"
        previewWebView.evaluateJavascript(js, null)
    }

    private fun buildElementTabs() {
        tabButtons.clear()
        elementTabs.removeAllViews()

        for ((idx, elem) in elements.withIndex()) {
            val btn = Button(this).apply {
                text = elem.label
                textSize = 12f
                isAllCaps = false
                setPadding(24, 12, 24, 12)
                // D-pad / remote navigation support
                isFocusable = true
                isFocusableInTouchMode = true
                setOnClickListener {
                    selectTab(idx)
                }
                // Highlight on focus (for remote/D-pad navigation)
                setOnFocusChangeListener { _, hasFocus ->
                    if (hasFocus) {
                        selectTab(idx)
                    }
                }
            }
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                marginEnd = 8
            }
            elementTabs.addView(btn, lp)
            tabButtons.add(btn)
        }
        highlightTab(0)
        // Request focus on the first tab so remote can navigate immediately
        tabButtons.firstOrNull()?.requestFocus()
    }

    private fun selectTab(idx: Int) {
        selectedElementIdx = idx
        highlightTab(idx)
        showSlidersForElement(idx)
    }

    private fun highlightTab(idx: Int) {
        for ((i, btn) in tabButtons.withIndex()) {
            if (i == idx) {
                btn.setBackgroundColor(Color.parseColor("#2980b9"))
                btn.setTextColor(Color.WHITE)
                btn.typeface = Typeface.DEFAULT_BOLD
            } else {
                btn.setBackgroundColor(Color.parseColor("#34495e"))
                btn.setTextColor(Color.parseColor("#ecf0f1"))
                btn.typeface = Typeface.DEFAULT
            }
        }
    }

    private fun showSlidersForElement(idx: Int) {
        sliderContainer.removeAllViews()
        val elem = elements[idx]

        // Special controls per element
        when (elem.label) {
            "Jam Digital" -> {
                // Digital style dropdown at the top
                val entries = resources.getStringArray(R.array.digital_style_entries)
                val values = resources.getStringArray(R.array.digital_style_values)
                addDropdown(
                    label = getString(R.string.layout_editor_dropdown_digital_style),
                    key = Settings.K_DIGITAL_STYLE,
                    entries = entries,
                    values = values
                )
            }
        }

        // Size slider
        addSlider(
            label = getString(R.string.layout_editor_size_label),
            key = elem.sizeKey,
            min = elem.sizeMin,
            max = elem.sizeMax,
            step = elem.sizeStep,
            suffix = "%"
        )

        // X/Y sliders for all elements
        addSlider(
            label = getString(R.string.layout_editor_x_label),
            key = elem.xKey,
            min = elem.offsetMin,
            max = elem.offsetMax,
            step = 1,
            suffix = "%"
        )

        addSlider(
            label = getString(R.string.layout_editor_y_label),
            key = elem.yKey,
            min = elem.offsetMin,
            max = elem.offsetMax,
            step = 1,
            suffix = "%"
        )

        // Additional controls for Identitas tab
        if (elem.label == "Identitas") {
            // Identity position dropdown
            val idPosEntries = resources.getStringArray(R.array.identity_position_entries)
            val idPosValues = resources.getStringArray(R.array.identity_position_values)
            addDropdown(
                label = getString(R.string.layout_editor_dropdown_identity_position),
                key = Settings.K_IDENTITY_POSITION,
                entries = idPosEntries,
                values = idPosValues
            )

            // Logo size slider
            addSlider(
                label = getString(R.string.pref_logo_size),
                key = Settings.K_LOGO_SIZE,
                min = 50,
                max = 200,
                step = 5,
                suffix = "%"
            )

            // Logo position dropdown
            val logoPosEntries = resources.getStringArray(R.array.logo_position_entries)
            val logoPosValues = resources.getStringArray(R.array.logo_position_values)
            addDropdown(
                label = getString(R.string.layout_editor_dropdown_logo_position),
                key = Settings.K_LOGO_POSITION,
                entries = logoPosEntries,
                values = logoPosValues
            )
        }
    }

    private fun addDropdown(label: String, key: String, entries: Array<String>, values: Array<String>) {
        val currentValue = workingStrings[key] ?: ""

        // Container
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, 8, 0, 16)
        }

        // Label
        val labelText = TextView(this).apply {
            text = label
            textSize = 14f
            setTextColor(Color.parseColor("#ecf0f1"))
            setPadding(0, 0, 0, 8)
        }

        // Spinner
        val spinner = Spinner(this).apply {
            isFocusable = true
            isFocusableInTouchMode = true
        }

        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, entries)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinner.adapter = adapter

        // Set current selection
        val currentIdx = values.indexOf(currentValue)
        if (currentIdx >= 0) {
            spinner.setSelection(currentIdx)
        }

        spinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                val newValue = values[position]
                if (workingStrings[key] != newValue) {
                    workingStrings[key] = newValue
                    pushConfigToPreview()
                }
            }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }

        container.addView(labelText)
        container.addView(spinner)
        sliderContainer.addView(container)
    }

    private fun addSlider(label: String, key: String, min: Int, max: Int, step: Int, suffix: String) {
        val currentValue = workingValues[key] ?: if (key.endsWith("_size")) 100 else 0

        // Container
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, 8, 0, 16)
        }

        // Label row with value
        val labelRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val labelText = TextView(this).apply {
            text = label
            textSize = 14f
            setTextColor(Color.parseColor("#ecf0f1"))
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        val valueText = TextView(this).apply {
            text = "$currentValue$suffix"
            textSize = 14f
            setTextColor(Color.parseColor("#3498db"))
            typeface = Typeface.DEFAULT_BOLD
        }

        labelRow.addView(labelText)
        labelRow.addView(valueText)

        // SeekBar
        val seekBar = SeekBar(this).apply {
            this.max = (max - min) / step
            progress = (currentValue - min) / step
            setPadding(0, 16, 0, 16)
            // D-pad / remote navigation support
            isFocusable = true
            isFocusableInTouchMode = true
            keyProgressIncrement = 1

            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(seekBar: SeekBar, progress: Int, fromUser: Boolean) {
                    if (!fromUser) return
                    val realValue = min + (progress * step)
                    workingValues[key] = realValue
                    valueText.text = "$realValue$suffix"
                    // Push to preview immediately for live feedback
                    pushConfigToPreview()
                }
                override fun onStartTrackingTouch(seekBar: SeekBar) {}
                override fun onStopTrackingTouch(seekBar: SeekBar) {}
            })
        }

        container.addView(labelRow)
        container.addView(seekBar)
        sliderContainer.addView(container)
    }

    private fun confirmReset() {
        AlertDialog.Builder(this)
            .setTitle(R.string.pref_reset_layout)
            .setMessage(R.string.pref_reset_layout_sum)
            .setPositiveButton(android.R.string.ok) { _, _ ->
                // Reset all working values to defaults
                for (elem in elements) {
                    workingValues[elem.sizeKey] = 100
                    workingValues[elem.xKey] = 0
                    workingValues[elem.yKey] = 0
                }
                // Reset logo size
                workingValues[Settings.K_LOGO_SIZE] = 100
                // Reset string settings to defaults
                workingStrings[Settings.K_IDENTITY_POSITION] = "left"
                workingStrings[Settings.K_LOGO_POSITION] = "right"
                workingStrings[Settings.K_DIGITAL_STYLE] = "classic"
                // Refresh sliders and preview
                showSlidersForElement(selectedElementIdx)
                pushConfigToPreview()
                Toast.makeText(this, R.string.layout_reset_done, Toast.LENGTH_SHORT).show()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun saveAndFinish() {
        // Write all working values to SharedPreferences
        val editor = Settings.prefs(this).edit()
        for ((key, value) in workingValues) {
            editor.putInt(key, value)
        }
        // Save string-type settings
        for ((key, value) in workingStrings) {
            editor.putString(key, value)
        }
        editor.apply()
        Toast.makeText(this, R.string.layout_editor_saved, Toast.LENGTH_SHORT).show()
        finish()
    }

    private fun togglePanel() {
        if (controlPanel.visibility == View.VISIBLE) {
            controlPanel.visibility = View.GONE
        } else {
            controlPanel.visibility = View.VISIBLE
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        // If panel is hidden, show it back first
        if (controlPanel.visibility == View.GONE) {
            controlPanel.visibility = View.VISIBLE
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        previewWebView.stopLoading()
        previewWebView.destroy()
        super.onDestroy()
    }
}
