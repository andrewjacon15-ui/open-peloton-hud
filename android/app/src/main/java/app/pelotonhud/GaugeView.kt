package app.pelotonhud

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.View
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/**
 * A vertical power meter drawn natively — the twin of the web PowerGauge (src/ui/PowerGauge.tsx), for the guide panel over Netflix/Kindle: a
 * fixed 0→~2×target scale with the allowable band highlighted and a marker at live power, green inside the band and red out. All values in
 * watts; `set()` updates and repaints. Draws nothing when there's no target (no FTP / no plan here).
 */
class GaugeView(context: Context) : View(context) {
    private var power = 0
    private var target = 0
    private var tol = 10

    fun set(power: Int, target: Int, tol: Int) {
        this.power = power
        this.target = target
        this.tol = tol
        invalidate()
    }

    private val d = context.resources.displayMetrics.density
    private fun dp(v: Float) = v * d

    private val trackFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#191B1F") }
    private val trackStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = dp(1f); color = Color.parseColor("#14FFFFFF")
    }
    private val bandPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val markerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { strokeWidth = dp(3f) }
    private val pillFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.parseColor("#0A0A0B") }
    private val pillStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = dp(1f) }
    private val nowText = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#F5F6F7"); textSize = dp(13f); textAlign = Paint.Align.CENTER
    }
    private val targetText = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#9CA0A8"); textSize = dp(10f); textAlign = Paint.Align.RIGHT
    }

    override fun onDraw(canvas: Canvas) {
        if (target <= 0) return
        val w = width.toFloat()
        val h = height.toFloat()
        val maxW = max(ceil(target * 2f / 50f).toInt() * 50, 100)
        val inZone = abs(power - target) <= tol
        val accent = if (inZone) GREEN else RED

        val radius = dp(12f)
        val track = RectF(dp(1f), dp(1f), w - dp(1f), h - dp(1f))
        canvas.drawRoundRect(track, radius, radius, trackFill)
        canvas.drawRoundRect(track, radius, radius, trackStroke)

        fun yFor(watt: Int): Float = h - min(1f, max(0f, watt / maxW.toFloat())) * h

        // Allowable band.
        bandPaint.color = (accent and 0x00FFFFFF) or (0x3A shl 24) // ~23% alpha of the accent
        canvas.drawRect(dp(3f), yFor(target + tol), w - dp(3f), yFor(target - tol), bandPaint)

        // Target label on the band's center line.
        canvas.drawText(target.toString(), w - dp(5f), yFor(target) - dp(3f), targetText)

        // Live-power marker + pill.
        val my = yFor(power)
        markerPaint.color = accent
        canvas.drawLine(0f, my, w, my, markerPaint)
        val pillW = dp(44f)
        val pillH = dp(20f)
        val pill = RectF(w / 2 - pillW / 2, my - pillH / 2, w / 2 + pillW / 2, my + pillH / 2)
        canvas.drawRoundRect(pill, pillH / 2, pillH / 2, pillFill)
        pillStroke.color = accent
        canvas.drawRoundRect(pill, pillH / 2, pillH / 2, pillStroke)
        canvas.drawText(power.toString(), w / 2, my + dp(4.5f), nowText)
    }

    private companion object {
        val GREEN = Color.parseColor("#2FBF71")
        val RED = Color.parseColor("#E3202B")
    }
}
