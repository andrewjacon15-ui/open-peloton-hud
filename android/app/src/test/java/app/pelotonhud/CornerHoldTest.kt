package app.pelotonhud

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CornerHoldTest {
    private fun hold() = CornerHold(cornerPx = 100f, slopPx = 20f, holdMs = 3000)

    @Test
    fun firesOnceAfterAHoldInTheCorner() {
        val h = hold()
        h.down(10f, 10f, t = 0)
        assertFalse("too early", h.fired(2999))
        assertTrue(h.fired(3000))
        assertFalse("only once per hold", h.fired(4000))
    }

    @Test
    fun ignoresTouchesOutsideTheCorner() {
        val h = hold()
        h.down(500f, 10f, t = 0)
        assertFalse(h.armed)
        assertFalse(h.fired(5000))
    }

    @Test
    fun liftingOrDraggingCancels() {
        val h = hold()
        h.down(10f, 10f, t = 0)
        h.cancel()
        assertFalse(h.fired(5000))

        h.down(10f, 10f, t = 0)
        h.move(15f, 12f) // within slop: still a hold
        assertTrue(h.armed)
        h.move(60f, 10f) // a drag
        assertFalse(h.fired(5000))
    }
}
