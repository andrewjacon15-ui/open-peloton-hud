package app.pelotonhud

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The native way out, drawn without the WebView: shown when the web app fails to load, when its renderer dies, or when the rider holds the
 * top-left corner (CornerHold). The HUD is the bike's launcher, so this is the one screen that must always work: Retry the HUD, open
 * Android Settings (Wi-Fi, apps), choose a different home app, or open Peloton's own app. Visual language follows docs/STYLE.md: red only
 * for the primary action, ghost buttons with hairline borders.
 */
class RecoveryScreen(
    context: Context,
    private val onRetry: () -> Unit,
    private val onAndroidSettings: () -> Unit,
    private val onChooseHome: () -> Unit,
    private val onOpenPeloton: () -> Unit,
    private val onClose: () -> Unit,
) : FrameLayout(context) {
    private val title = TextView(context)
    private val detail = TextView(context)
    private val closeBtn: TextView

    init {
        setBackgroundColor(BG)
        isClickable = true // swallow touches so nothing reaches the WebView underneath
        val col = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        title.apply {
            setTextColor(TEXT)
            textSize = 30f
            typeface = Typeface.create("sans-serif-condensed", Typeface.BOLD)
            gravity = Gravity.CENTER
        }
        detail.apply {
            setTextColor(MUTED)
            textSize = 17f
            gravity = Gravity.CENTER
            setPadding(0, dp(10), 0, dp(32))
            maxWidth = dp(640)
        }
        col.addView(title)
        col.addView(detail)
        col.addView(button("Retry", primary = true, onRetry))
        col.addView(button("Android settings", primary = false, onAndroidSettings))
        col.addView(button("Choose home app", primary = false, onChooseHome))
        col.addView(button("Open Peloton app", primary = false, onOpenPeloton))
        closeBtn = button("Back to the HUD", primary = false, onClose)
        col.addView(closeBtn)
        addView(col, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.CENTER))
    }

    /** Fill in why the screen is up. `canClose` is false when the HUD itself failed (there is nothing behind this screen to go back to). */
    fun show(heading: String, why: String, canClose: Boolean) {
        title.text = heading
        detail.text = why
        closeBtn.visibility = if (canClose) View.VISIBLE else View.GONE
        visibility = View.VISIBLE
        bringToFront()
    }

    fun hide() {
        visibility = View.GONE
    }

    val isShowing: Boolean get() = visibility == View.VISIBLE

    private fun button(label: String, primary: Boolean, onClick: () -> Unit) = TextView(context).apply {
        text = label
        textSize = 18f
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        gravity = Gravity.CENTER
        setTextColor(if (primary) Color.WHITE else TEXT)
        background = GradientDrawable().apply {
            cornerRadius = dp(10).toFloat()
            if (primary) setColor(RED) else setStroke(dp(1), BTN_BORDER)
        }
        minWidth = dp(320)
        setPadding(dp(28), dp(16), dp(28), dp(16))
        isClickable = true
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(12)
        }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private companion object {
        val BG = Color.parseColor("#0A0A0B")
        val TEXT = Color.parseColor("#F5F6F7")
        val MUTED = Color.parseColor("#9CA0A8")
        val BTN_BORDER = Color.parseColor("#29FFFFFF")
        val RED = Color.parseColor("#E3202B")
    }
}
