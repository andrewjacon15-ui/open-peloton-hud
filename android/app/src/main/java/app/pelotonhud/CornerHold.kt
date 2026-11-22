package app.pelotonhud

/**
 * The escape gesture: hold one finger in the top-left corner for a few seconds to open the native recovery screen, whatever the web app is
 * doing (it may have failed to load, or be stuck). MainActivity feeds it every touch without consuming any, so taps there still reach the
 * page. Pure (times and positions in, a decision out) so it can be unit-tested.
 */
class CornerHold(private val cornerPx: Float, private val slopPx: Float, private val holdMs: Long) {
    private var downAt = -1L
    private var x0 = 0f
    private var y0 = 0f

    /** A first finger went down. Only a touch that starts inside the corner arms the gesture. */
    fun down(x: Float, y: Float, t: Long) {
        if (x <= cornerPx && y <= cornerPx) {
            downAt = t
            x0 = x
            y0 = y
        } else {
            downAt = -1
        }
    }

    /** The finger moved: drifting further than the touch slop cancels (it is a drag or a scroll, not a hold). */
    fun move(x: Float, y: Float) {
        if (downAt >= 0 && (Math.abs(x - x0) > slopPx || Math.abs(y - y0) > slopPx)) downAt = -1
    }

    /** The finger lifted, a second finger joined, or the touch was cancelled. */
    fun cancel() {
        downAt = -1
    }

    val armed: Boolean get() = downAt >= 0

    /** True once, when the hold has lasted long enough; it then disarms so it fires a single time per hold. */
    fun fired(now: Long): Boolean {
        if (downAt < 0 || now - downAt < holdMs) return false
        downAt = -1
        return true
    }
}
