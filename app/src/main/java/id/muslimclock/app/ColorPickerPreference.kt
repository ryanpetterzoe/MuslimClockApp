package id.muslimclock.app

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.util.AttributeSet
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.preference.DialogPreference
import androidx.preference.Preference
import androidx.preference.PreferenceDialogFragmentCompat
import androidx.preference.PreferenceFragmentCompat

/**
 * A preference that stores a hex colour string (`#RRGGBB`) and pops up a
 * picker with a grid of preset swatches plus a free-form hex field for
 * advanced users.
 *
 * Designed to slot into the existing `theme_primary` / `theme_accent`
 * keys used by the WebView (it stays a plain `String` preference under
 * the hood — the JS side keeps consuming `#RRGGBB` without changes).
 *
 * Key behaviours:
 *  - Summary shows a coloured circle plus the hex code, so the current
 *    value is glanceable.
 *  - Hitting a swatch immediately commits the value and closes the
 *    dialog (one D-pad press on Android TV → done).
 *  - The hex field accepts both `#RRGGBB` and `RRGGBB` and validates
 *    on the fly. Invalid input disables OK.
 */
class ColorPickerPreference @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = androidx.preference.R.attr.dialogPreferenceStyle,
    defStyleRes: Int = 0
) : DialogPreference(context, attrs, defStyleAttr, defStyleRes) {

    /** The current persisted value, normalised to `#RRGGBB` (lowercase). */
    private var value: String = DEFAULT

    init {
        // We render the swatch ourselves in onBindViewHolder; default
        // summary is updated whenever the value changes.
        isPersistent = true
    }

    override fun onSetInitialValue(defaultValue: Any?) {
        val initial = getPersistedString(defaultValue as? String ?: DEFAULT)
        setColorValue(initial, persist = false)
    }

    override fun onGetDefaultValue(a: android.content.res.TypedArray, index: Int): Any? =
        a.getString(index) ?: DEFAULT

    fun getColorValue(): String = value

    fun setColorValue(newValue: String?, persist: Boolean = true) {
        val cleaned = normalise(newValue) ?: DEFAULT
        if (cleaned == value && hasKey()) {
            // Still update summary in case the row was just bound.
            notifyChanged()
            return
        }
        value = cleaned
        if (persist) persistString(cleaned)
        notifyChanged()
    }

    override fun onBindViewHolder(holder: androidx.preference.PreferenceViewHolder) {
        super.onBindViewHolder(holder)
        // Rebuild summary every bind: a small swatch + the hex code.
        val summaryView = holder.findViewById(android.R.id.summary) as? TextView
        if (summaryView != null) {
            val dot = makeSwatchDrawable(parseSafely(value))
            val px = (16 * context.resources.displayMetrics.density).toInt()
            dot.setBounds(0, 0, px, px)
            summaryView.setCompoundDrawables(dot, null, null, null)
            summaryView.compoundDrawablePadding =
                (8 * context.resources.displayMetrics.density).toInt()
            summaryView.text = value.uppercase()
            summaryView.visibility = View.VISIBLE
        }
    }

    companion object {
        const val DEFAULT = "#0a4ea3"

        /**
         * Curated palette: 6 brand-friendly hues × 4 luminance steps. The
         * first row is the recommended set for a Muslim Clock primary
         * (deep saturated blues / teals / greens). Last row trends toward
         * warm accents.
         */
        private val PRESETS = arrayOf(
            // Deep & rich (primary candidates)
            "#0a4ea3", "#1d4ed8", "#0f766e", "#15803d", "#7c2d12", "#581c87",
            // Mid-tones
            "#2563eb", "#0891b2", "#16a34a", "#ca8a04", "#dc2626", "#9333ea",
            // Lighter
            "#60a5fa", "#22d3ee", "#34d399", "#fbbf24", "#f87171", "#c084fc",
            // Neutrals + accent staples
            "#f5b301", "#f59e0b", "#fde68a", "#0f172a", "#475569", "#ffffff"
        )

        fun presets(): Array<String> = PRESETS

        /** Accept `#RRGGBB`, `RRGGBB`, `#RGB`, `RGB`. Returns null if invalid. */
        fun normalise(raw: String?): String? {
            if (raw.isNullOrBlank()) return null
            val s = raw.trim().removePrefix("#")
            val hex = when (s.length) {
                3 -> s.map { c -> "$c$c" }.joinToString("")  // expand short form
                6 -> s
                else -> return null
            }
            if (!hex.all { c -> c.isDigit() || c in 'a'..'f' || c in 'A'..'F' }) return null
            return "#" + hex.lowercase()
        }

        fun parseSafely(hex: String): Int =
            try { Color.parseColor(normalise(hex) ?: DEFAULT) } catch (e: Exception) {
                Color.parseColor(DEFAULT)
            }

        /**
         * Build a circular drawable for a swatch. Returns a stroked
         * filled circle so light colours stay visible against a light
         * settings background.
         */
        fun makeSwatchDrawable(colorInt: Int): GradientDrawable {
            return GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(colorInt)
                setStroke(2, 0x33000000)
            }
        }
    }
}


/**
 * Dialog backing [ColorPickerPreference]. Renders a 6-column grid of
 * preset swatches plus a hex input row.
 */
class ColorPickerDialogFragment : PreferenceDialogFragmentCompat() {

    private var pendingValue: String = ColorPickerPreference.DEFAULT
    private var hexInput: EditText? = null
    private var previewSwatch: View? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pref = preference as? ColorPickerPreference ?: return
        pendingValue = savedInstanceState?.getString(KEY_PENDING)
            ?: pref.getColorValue()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(KEY_PENDING, pendingValue)
    }

    override fun onCreateDialogView(context: Context): View {
        val density = context.resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(12), dp(20), dp(8))
        }

        // Preview row: big swatch + current hex.
        val previewRow = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, dp(12))
        }
        previewSwatch = View(context).apply {
            layoutParams = LinearLayout.LayoutParams(dp(36), dp(36)).apply {
                marginEnd = dp(12)
            }
            background = ColorPickerPreference.makeSwatchDrawable(
                ColorPickerPreference.parseSafely(pendingValue)
            )
        }
        previewRow.addView(previewSwatch)
        val previewLabel = TextView(context).apply {
            textSize = 16f
            text = pendingValue.uppercase()
            setTextColor(0xFF111111.toInt())
        }
        previewRow.addView(previewLabel)
        root.addView(previewRow)

        // Preset grid: 6 columns × N rows.
        val grid = GridLayout(context).apply {
            columnCount = 6
            rowCount = (ColorPickerPreference.presets().size + 5) / 6
        }
        val swatchSize = dp(40)
        val swatchMargin = dp(6)
        for (preset in ColorPickerPreference.presets()) {
            val sw = View(context).apply {
                layoutParams = GridLayout.LayoutParams().apply {
                    width = swatchSize
                    height = swatchSize
                    setMargins(swatchMargin, swatchMargin, swatchMargin, swatchMargin)
                }
                background = ColorPickerPreference.makeSwatchDrawable(
                    ColorPickerPreference.parseSafely(preset)
                )
                isClickable = true
                isFocusable = true
                isFocusableInTouchMode = false
                contentDescription = preset
                // Focus highlight for TV remote / D-pad navigation:
                // show a thick white ring + accent glow around the
                // focused swatch so users know which colour they're
                // about to select.
                setOnFocusChangeListener { v, hasFocus ->
                    if (hasFocus) {
                        v.scaleX = 1.25f
                        v.scaleY = 1.25f
                        v.elevation = dp(8).toFloat()
                        // Add a bright ring via foreground (API 23+)
                        val ring = GradientDrawable().apply {
                            shape = GradientDrawable.OVAL
                            setColor(0x00000000)
                            setStroke(dp(3), 0xFFFFFFFF.toInt())
                        }
                        v.foreground = ring
                    } else {
                        v.scaleX = 1.0f
                        v.scaleY = 1.0f
                        v.elevation = 0f
                        v.foreground = null
                    }
                }
                setOnClickListener {
                    pendingValue = preset
                    updatePreview(previewLabel)
                    hexInput?.setText(preset.uppercase())
                    // For a one-tap experience: commit immediately and
                    // dismiss. Users who want to fine-tune via hex can
                    // tab to the field instead.
                    commitAndDismiss()
                }
            }
            grid.addView(sw)
        }
        root.addView(grid)

        // Hex input row.
        val hexRow = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(16), 0, 0)
        }
        val hexLabel = TextView(context).apply {
            text = "Hex:"
            textSize = 14f
            setTextColor(0xFF555555.toInt())
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { marginEnd = dp(8) }
        }
        hexRow.addView(hexLabel)
        hexInput = EditText(context).apply {
            layoutParams = LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f
            )
            setText(pendingValue.uppercase())
            // Live validate: update preview when hex parses cleanly.
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                override fun afterTextChanged(s: Editable?) {
                    val parsed = ColorPickerPreference.normalise(s?.toString())
                    if (parsed != null) {
                        pendingValue = parsed
                        updatePreview(previewLabel)
                    }
                }
            })
        }
        hexRow.addView(hexInput)
        root.addView(hexRow)

        return root
    }

    private fun updatePreview(label: TextView) {
        previewSwatch?.background = ColorPickerPreference.makeSwatchDrawable(
            ColorPickerPreference.parseSafely(pendingValue)
        )
        label.text = pendingValue.uppercase()
    }

    /**
     * The framework normally only calls onDialogClosed when the user hits
     * OK / Cancel. We bypass that for direct swatch taps so the picker
     * behaves like a single-action chooser.
     */
    private fun commitAndDismiss() {
        val pref = preference as? ColorPickerPreference ?: return
        val cleaned = ColorPickerPreference.normalise(pendingValue) ?: return
        if (pref.callChangeListener(cleaned)) {
            pref.setColorValue(cleaned)
        }
        dialog?.dismiss()
    }

    override fun onDialogClosed(positiveResult: Boolean) {
        if (!positiveResult) return
        val pref = preference as? ColorPickerPreference ?: return
        val cleaned = ColorPickerPreference.normalise(
            hexInput?.text?.toString() ?: pendingValue
        ) ?: return
        if (pref.callChangeListener(cleaned)) {
            pref.setColorValue(cleaned)
        }
    }

    companion object {
        private const val KEY_PENDING = "mc_pending_color"

        fun newInstance(key: String): ColorPickerDialogFragment =
            ColorPickerDialogFragment().apply {
                arguments = Bundle().apply { putString(ARG_KEY, key) }
            }
    }
}


/**
 * Helper extension so the [SettingsActivity] can route
 * [ColorPickerPreference] clicks to [ColorPickerDialogFragment]. Call
 * this from the fragment's [PreferenceFragmentCompat.onDisplayPreferenceDialog]
 * before delegating to super.
 *
 * Returns true if the click was handled.
 */
fun PreferenceFragmentCompat.maybeShowColorPicker(preference: Preference): Boolean {
    if (preference !is ColorPickerPreference) return false
    if (parentFragmentManager.findFragmentByTag(TAG_COLOR) != null) return true
    val dialog = ColorPickerDialogFragment.newInstance(preference.key)
    dialog.setTargetFragment(this, 0)
    dialog.show(parentFragmentManager, TAG_COLOR)
    return true
}

private const val TAG_COLOR = "id.muslimclock.app.ColorPickerDialog"
