package app.pelotonhud

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import kotlin.math.roundToInt

/**
 * A slim system overlay drawn across the top of Netflix or Kindle (any entertainment that runs as its own app). It is a faithful native
 * copy of the web ride bar the HUD shows over a YouTube video (`.obar` in src/styles.css, src/ui/RideView.tsx) so the top UI is identical no
 * matter what you launch: the same ride stats grouped on the left — TIME, POWER (red), CADENCE, RESIST, OUTPUT, CAL — the same controls on
 * the right drawn with the same icons (Home → the HUD, Start/Stop, and the sliders button that pops out volume/brightness), the same
 * near-black ground with a hairline, quiet condensed labels, steady tabular values, and Peloton red reserved for live power and the
 * filled Start button.
 *
 * Unlike the web bar there is no Back button here: Netflix and Kindle are their own apps, so stepping back is the native app's own job (its
 * back gesture/button, which returns to the HUD). Back only makes sense for the in-WebView YouTube player, where it drops to the picker.
 *
 * The bar can also be collapsed (the chevron control): it tucks away to a thin pull-down handle so a book's top line isn't covered while
 * reading, and the handle brings it back. This is the one thing the web bar doesn't need — the web bar sits above the content in normal flow,
 * while this draws over a full-screen app.
 *
 * It is fed natively (not from the web app) on purpose: while the other app is in front, MainActivity is stopped and the WebView's JS timers
 * are throttled, so web-computed numbers would freeze here. Power/cadence/resistance come straight from the SensorSource (which runs on the
 * main looper regardless). TIME, OUTPUT and CAL mirror the web recorder (src/domain/metrics.ts): seeded with the ride's current values when
 * launched, then advanced one second and Σpower/1000 kJ per buffered sample (MainActivity's 1 Hz tick). When no ride is recording they hold.
 * Needs SYSTEM_ALERT_WINDOW (granted via adb).
 */
class NetflixOverlay(
    private val context: Context,
    private val onHome: () -> Unit,
    private val onToggleRide: () -> Unit = {},
    private val onSetVolume: (Double) -> Unit = {},
    private val onSetBrightness: (Double) -> Unit = {},
) {
    private val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val values = mutableMapOf<String, TextView>()
    private var root: View? = null
    private var elapsedSec = 0
    private var outputKj = 0.0
    private var weightKg = 75.0
    private var recording = false
    private var toggleBtn: TextView? = null
    private var avgPowerView: TextView? = null // the ride's average power, shown small next to live power
    private var levelsRow: View? = null
    private var volumeBar: SeekBar? = null
    private var brightnessBar: SeekBar? = null
    private var rootLp: WindowManager.LayoutParams? = null
    private var barGroup: View? = null // the full bar (stats + controls + hairline), hidden when collapsed for reading
    private var handleView: View? = null // the thin pull-down tab shown when collapsed, to bring the bar back
    private var collapsed = false

    // The guide (power plan) panel: a second small window at the top-right drawing the power gauge over Netflix/Kindle, the native twin of
    // the web GuideOverlay. Driven by `plan` (segment durations + watt targets) walked against elapsedSec, so it advances while the web is
    // frozen behind the app. Empty plan → no panel.
    private var plan: List<PlanSeg> = emptyList()
    private var gaugeRoot: View? = null
    private var gaugeView: GaugeView? = null
    private var gaugeTimeView: TextView? = null
    private var livePower = 0

    /** A workout segment flattened for the overlay: how long it lasts and its watt target (0 when no FTP). Mirrors src/rides/rides.ts PlanSegment. */
    class PlanSeg(val durationSec: Int, val targetW: Int)

    val isShowing: Boolean
        get() = root != null

    /**
     * @param seedElapsedSec the ride's elapsed seconds at launch (0 when not recording), so TIME continues the ride.
     * @param seedOutputKj the ride's output at launch, so OUTPUT continues the ride.
     * @param seedWeightKg the rider weight, so CAL matches the web's weight-based calories.
     * @param recording whether a ride is recording — decides the Start/Stop label.
     */
    fun show(seedElapsedSec: Int, seedOutputKj: Double, seedWeightKg: Double, recording: Boolean, plan: List<PlanSeg> = emptyList()) {
        if (root != null) return
        elapsedSec = seedElapsedSec
        outputKj = seedOutputKj
        weightKg = if (seedWeightKg > 0) seedWeightKg else 75.0
        this.recording = recording
        this.plan = plan

        val stats = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.BOTTOM // labels over values, baselines aligned — matches `.obar-stats { align-items: flex-end }`.
        }
        stats.addView(stat("TIME"))
        stats.addView(stat("POWER", "W", POWER_RED, withAvg = true), gap())
        stats.addView(stat("CADENCE", "rpm"), gap())
        stats.addView(stat("RESIST", "%"), gap())
        stats.addView(stat("OUTPUT", "kJ"), gap())
        stats.addView(stat("CAL", "kcal"), gap())

        // No Back here (that's the native app's own job) — just Home, Start/Stop, and the sliders popout, drawn with the same icons as the web bar.
        val controls = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        controls.addView(iconButton(R.drawable.ic_obar_home) { onHome() })
        controls.addView(startStopButton(), LinearLayout.LayoutParams(WRAP, WRAP).apply { marginStart = dp(8) })
        controls.addView(iconButton(R.drawable.ic_obar_sliders, marginStart = dp(8)) { toggleLevels() })
        // Tuck the whole bar away for reading (Kindle draws text to the top edge); a thin handle brings it back.
        controls.addView(iconButton(R.drawable.ic_obar_chevron_up, marginStart = dp(8)) { setCollapsed(true) })

        val spacer = View(context) // pushes controls to the right edge — matches `.obar { justify-content: space-between }`.

        val bar = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(BG) // --bg, opaque so stats read over any scene (matches `.obar { background: #0a0a0b }`).
            setPadding(dp(22), dp(9), dp(14), dp(9))
            addView(stats)
            addView(spacer, LinearLayout.LayoutParams(0, 1, 1f))
            addView(controls)
        }

        // Hairline under the bar — what makes it read as engineered rather than a slab (matches `.obar { border-bottom }`).
        val hairline = View(context).apply { setBackgroundColor(HAIRLINE) }
        val levels = levelsRow()

        // The whole bar as one group, so collapsing hides it in one move; the handle (a thin pull-down tab) takes its place.
        val barGroup = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            addView(bar, LinearLayout.LayoutParams(MATCH, WRAP))
            addView(levels, LinearLayout.LayoutParams(MATCH, WRAP))
            addView(hairline, LinearLayout.LayoutParams(MATCH, dp(1)))
        }
        val handle = handlePill()
        handle.visibility = View.GONE // start expanded

        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.END // right-align the collapsed handle (least over left-aligned book text); the full bar is full-width anyway
            addView(barGroup, LinearLayout.LayoutParams(MATCH, WRAP))
            addView(handle, LinearLayout.LayoutParams(WRAP, WRAP).apply { marginEnd = dp(14) })
        }
        this.barGroup = barGroup
        this.handleView = handle
        collapsed = false

        val lp = WindowManager.LayoutParams(
            MATCH,
            WRAP,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT,
        ).apply { gravity = Gravity.TOP }

        wm.addView(root, lp)
        this.root = root
        this.rootLp = lp
        renderTime()
        renderOutput()
        renderCalories()
        renderAvgPower()
        if (plan.isNotEmpty()) showGaugePanel()
        renderGauge()
    }

    /** Live power/cadence/resistance from the sensor (called on every reading). TIME, OUTPUT and CAL advance separately, in advance(). */
    fun update(power: Int, cadence: Int, resistance: Int) {
        if (root == null) return
        livePower = power
        values["POWER"]?.text = power.toString()
        values["CADENCE"]?.text = cadence.toString()
        values["RESIST"]?.text = resistance.toString()
        renderGauge()
    }

    /** One recorded second: advance TIME, add this second's power to OUTPUT (Σpower / 1000 = kJ), recompute CAL. Driven by MainActivity's
     *  1 Hz sample buffer, so it stops exactly when buffering does (ride paused, ended, or not recording). */
    fun advance(power: Int) {
        if (root == null) return
        elapsedSec += 1
        outputKj += power / 1000.0
        renderTime()
        renderOutput()
        renderCalories()
        renderAvgPower()
        renderGauge()
    }

    /** A new ride began from the overlay's Start button: reset the counters so TIME/OUTPUT/CAL count from zero. */
    fun resetRide() {
        elapsedSec = 0
        outputKj = 0.0
        renderTime()
        renderOutput()
        renderCalories()
        renderAvgPower()
        renderGauge()
    }

    /** Reflect the recording state in the Start/Stop button (after the overlay's own toggle, or a web-driven change). */
    fun setRecording(on: Boolean) {
        recording = on
        applyToggleStyle()
    }

    /** Reflect the device volume/brightness (0..1) in the popout sliders — e.g. when the hardware volume keys are used. */
    fun setLevels(volume: Double, brightness: Double) {
        volumeBar?.let { if (!it.isPressed) it.progress = (volume.coerceIn(0.0, 1.0) * 100).roundToInt() }
        brightnessBar?.let { if (!it.isPressed) it.progress = (brightness.coerceIn(0.0, 1.0) * 100).roundToInt() }
    }

    fun hide() {
        root?.let { runCatching { wm.removeView(it) } }
        gaugeRoot?.let { runCatching { wm.removeView(it) } }
        root = null
        rootLp = null
        values.clear()
        toggleBtn = null
        avgPowerView = null
        levelsRow = null
        volumeBar = null
        brightnessBar = null
        barGroup = null
        handleView = null
        collapsed = false
        gaugeRoot = null
        gaugeView = null
        gaugeTimeView = null
        plan = emptyList()
    }

    /** Tuck the bar away (collapsed) so a book's top line isn't covered, leaving only the thin handle; or bring it back. */
    private fun setCollapsed(c: Boolean) {
        collapsed = c
        barGroup?.visibility = if (c) View.GONE else View.VISIBLE
        handleView?.visibility = if (c) View.VISIBLE else View.GONE
        renderGauge() // the guide panel tucks away with the bar
        val r = root ?: return
        val lp = rootLp ?: return
        runCatching { wm.updateViewLayout(r, lp) } // re-measure the WRAP-height window to the new content
    }

    private fun toggleLevels() {
        levelsRow?.let { it.visibility = if (it.visibility == View.GONE) View.VISIBLE else View.GONE }
    }

    private fun renderTime() {
        values["TIME"]?.text = "%d:%02d".format(elapsedSec / 60, elapsedSec % 60)
    }

    private fun renderOutput() {
        values["OUTPUT"]?.text = "%.1f".format(outputKj)
    }

    /** Weight-based calories, identical to src/domain/metrics.ts rideCalories: active work + a resting burn scaled by body mass and time. */
    private fun renderCalories() {
        val active = outputKj / GROSS_EFFICIENCY / KJ_PER_KCAL
        val resting = RMR_KCAL_PER_KG_HOUR * weightKg * (elapsedSec / 3600.0)
        values["CAL"]?.text = (active + resting).roundToInt().toString()
    }

    /** Average power over the ride so far = total work / time. Derived from outputKj and elapsedSec, so it matches the web bar's
     *  ride.metrics.avgPower (outputKj = Σpower/1000, so outputKj*1000/elapsedSec ≈ Σpower/n). */
    private fun renderAvgPower() {
        val avg = if (elapsedSec > 0) (outputKj * 1000.0 / elapsedSec).roundToInt() else 0
        avgPowerView?.text = "avg $avg"
    }

    /** The guide panel's current target and seconds left in the segment, by walking the plan against elapsedSec. Null when the plan is done,
     *  empty, or at a segment with no watt target (no FTP) — the panel hides in those cases. The native twin of segmentAt + targetWatts. */
    private fun planTargetAndRemaining(): Pair<Int, Int>? {
        var acc = 0
        for (seg in plan) {
            if (elapsedSec < acc + seg.durationSec) {
                return if (seg.targetW > 0) Pair(seg.targetW, acc + seg.durationSec - elapsedSec) else null
            }
            acc += seg.durationSec
        }
        return null
    }

    /** Push the current target + live power into the gauge and update the time-left; hide the panel when there's nothing to guide (plan done,
     *  no target) or the bar is collapsed for reading. */
    private fun renderGauge() {
        val g = gaugeView ?: return
        val tr = planTargetAndRemaining()
        if (tr == null) {
            gaugeRoot?.visibility = View.GONE
            return
        }
        val (target, remaining) = tr
        g.set(livePower, target, maxOf(10, (target * 0.05).roundToInt()))
        gaugeTimeView?.text = "%d:%02d left".format(remaining / 60, remaining % 60)
        gaugeRoot?.visibility = if (collapsed) View.GONE else View.VISIBLE
    }

    /** Build the guide panel — a small second window at the top-right (below the bar), drawing the power gauge over Netflix/Kindle. Only added
     *  when a plan is running; its visibility is then driven by renderGauge(). */
    private fun showGaugePanel() {
        if (gaugeRoot != null) return
        val gauge = GaugeView(context).also { gaugeView = it }
        val title = TextView(context).apply {
            text = "PLAN"
            setTextColor(MUTED)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
            typeface = Typeface.create("sans-serif-condensed", Typeface.NORMAL)
            letterSpacing = 0.08f
        }
        val time = TextView(context).apply {
            setTextColor(MUTED)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            fontFeatureSettings = "tnum"
        }.also { gaugeTimeView = it }
        val panel = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            background = GradientDrawable().apply {
                cornerRadius = dp(14).toFloat()
                setColor(BG)
                setStroke(dp(1), BTN_BORDER)
            }
            setPadding(dp(12), dp(10), dp(12), dp(12))
            addView(title)
            addView(gauge, LinearLayout.LayoutParams(dp(126), dp(172)).apply { topMargin = dp(8) })
            addView(time, LinearLayout.LayoutParams(WRAP, WRAP).apply { topMargin = dp(8) })
        }
        val lp = WindowManager.LayoutParams(
            WRAP,
            WRAP,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = dp(14)
            y = dp(104) // hang below the top bar
        }
        wm.addView(panel, lp)
        gaugeRoot = panel
    }

    /** One label-over-value column; the value is Peloton red only for live power, the unit smaller and muted — matches `.obar-stat`.
     *  `withAvg` adds the ride's average power small and muted right after the value, matching `.obar-avg` on the web bar. */
    private fun stat(label: String, unit: String = "", valueColor: Int = TEXT, withAvg: Boolean = false): View {
        val caption = TextView(context).apply {
            text = label
            setTextColor(MUTED)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
            typeface = Typeface.create("sans-serif-condensed", Typeface.NORMAL)
            letterSpacing = 0.08f
        }
        val value = TextView(context).apply {
            text = "0"
            setTextColor(valueColor)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 25f)
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            letterSpacing = -0.01f
            fontFeatureSettings = "tnum" // Steady tabular figures so numbers don't jitter as they change.
        }
        values[label] = value
        val valueRow = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.BOTTOM
            addView(value)
            if (unit.isNotEmpty()) {
                addView(TextView(context).apply {
                    text = unit
                    setTextColor(MUTED)
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
                    setPadding(dp(3), 0, 0, dp(3)) // margin-left: 3px, and sit on the value's baseline.
                })
            }
            if (withAvg) {
                avgPowerView = TextView(context).apply {
                    text = "avg 0"
                    setTextColor(MUTED)
                    setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
                    typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
                    fontFeatureSettings = "tnum"
                    setPadding(dp(8), 0, 0, dp(3)) // margin-left: 8px, sitting on the value's baseline — matches .obar-avg.
                }
                addView(avgPowerView)
            }
        }
        return LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            addView(caption)
            addView(valueRow)
        }
    }

    /** The Start/Stop control — the one red accent among the buttons: a filled red "Start ride" to invite it, a hairline ghost "Stop ride"
     *  with a red glyph to make ending deliberate. Matches `.obar-btn.start` / `.obar-btn.stop`. */
    private fun startStopButton(): TextView = TextView(context).apply {
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        setPadding(dp(16), dp(10), dp(16), dp(10))
        toggleBtn = this
        setOnClickListener { onToggleRide() }
        applyToggleStyle()
    }

    /** Paint the Start/Stop button for the current recording state — filled red (Start) vs hairline ghost with red text (Stop). */
    private fun applyToggleStyle() {
        val b = toggleBtn ?: return
        if (recording) {
            b.text = "Stop ride"
            b.setTextColor(STOP_RED)
            b.background = ghostBg()
        } else {
            b.text = "Start ride"
            b.setTextColor(Color.WHITE)
            b.background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(RED)
            }
        }
    }

    /** The collapsible volume + brightness row the "≡" button reveals — the native twin of `.obar-levels` + DeviceControls. Hidden by default. */
    private fun levelsRow(): View {
        volumeBar = seekBar { onSetVolume(it) }
        brightnessBar = seekBar { onSetBrightness(it) }
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(BG)
            setPadding(dp(22), dp(2), dp(22), dp(12))
            visibility = View.GONE
            addView(sliderLabel("VOL"))
            addView(volumeBar, LinearLayout.LayoutParams(0, WRAP, 1f).apply { marginStart = dp(10); marginEnd = dp(22) })
            addView(sliderLabel("BRIGHT"))
            addView(brightnessBar, LinearLayout.LayoutParams(0, WRAP, 1f).apply { marginStart = dp(10) })
        }
        levelsRow = row
        return row
    }

    private fun sliderLabel(text: String) = TextView(context).apply {
        this.text = text
        setTextColor(MUTED)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 10.5f)
        typeface = Typeface.create("sans-serif-condensed", Typeface.NORMAL)
        letterSpacing = 0.08f
    }

    private fun seekBar(onLevel: (Double) -> Unit): SeekBar = SeekBar(context).apply {
        max = 100
        setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar, progress: Int, fromUser: Boolean) {
                if (fromUser) onLevel(progress / 100.0) // ignore programmatic setLevels() so the echo doesn't loop
            }
            override fun onStartTrackingTouch(sb: SeekBar) {}
            override fun onStopTrackingTouch(sb: SeekBar) {}
        })
    }

    /** A square icon control (hairline border, no fill, a tinted vector glyph) — the native twin of `.obar-btn.obar-icon`: 44dp wide, the
     *  glyph centered, tinted to the bar's text color so it reads the same as the web SVG icons. */
    private fun iconButton(res: Int, marginStart: Int = 0, onClick: () -> Unit): ImageView = ImageView(context).apply {
        setImageResource(res)
        setColorFilter(TEXT)
        scaleType = ImageView.ScaleType.CENTER
        setPadding(dp(13), dp(10), dp(13), dp(10)) // 18dp glyph + 13dp either side = a 44dp-wide button, matching the web icon buttons
        background = ghostBg()
        layoutParams = LinearLayout.LayoutParams(WRAP, WRAP).apply { this.marginStart = marginStart }
        setOnClickListener { onClick() }
    }

    /** The hairline ghost background shared by the icon buttons and the Stop button — matches `.obar-btn`'s border, no fill. */
    private fun ghostBg() = GradientDrawable().apply {
        cornerRadius = dp(10).toFloat()
        setColor(Color.TRANSPARENT)
        setStroke(dp(1), BTN_BORDER)
    }

    /** The thin pull-down tab shown when the bar is collapsed: flush with the top edge, bottom corners rounded, a chevron to bring the bar back. */
    private fun handlePill(): ImageView = ImageView(context).apply {
        setImageResource(R.drawable.ic_obar_chevron_down)
        setColorFilter(TEXT)
        scaleType = ImageView.ScaleType.CENTER
        setPadding(dp(18), dp(4), dp(18), dp(7))
        val r = dp(12).toFloat()
        background = GradientDrawable().apply {
            cornerRadii = floatArrayOf(0f, 0f, 0f, 0f, r, r, r, r) // bottom corners only — it hangs from the top edge
            setColor(BG)
            setStroke(dp(1), BTN_BORDER)
        }
        setOnClickListener { setCollapsed(false) }
    }

    private fun gap() = LinearLayout.LayoutParams(WRAP, WRAP).apply { marginStart = dp(34) }
    private fun dp(v: Int) = (v * context.resources.displayMetrics.density).toInt()

    private companion object {
        const val MATCH = WindowManager.LayoutParams.MATCH_PARENT
        const val WRAP = WindowManager.LayoutParams.WRAP_CONTENT
        // Must match src/domain/metrics.ts so the overlay's CAL equals the web's.
        const val GROSS_EFFICIENCY = 0.24
        const val KJ_PER_KCAL = 4.184
        const val RMR_KCAL_PER_KG_HOUR = 1.0
        val BG = Color.parseColor("#0A0A0B")
        val HAIRLINE = Color.parseColor("#1AFFFFFF") // rgba(255,255,255,0.1)
        val BTN_BORDER = Color.parseColor("#29FFFFFF") // rgba(255,255,255,0.16)
        val TEXT = Color.parseColor("#F5F6F7")
        val MUTED = Color.parseColor("#9CA0A8")
        val POWER_RED = Color.parseColor("#E3202B")
        val RED = Color.parseColor("#E3202B") // --red: the filled Start button, same hue as live power
        val STOP_RED = Color.parseColor("#FF5A62")
    }
}
