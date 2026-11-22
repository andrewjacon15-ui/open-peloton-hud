package app.pelotonhud

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FocusPolicyTest {
    private val self = "app.pelotonhud"

    @Test
    fun reclaimsFromPelotonApps() {
        assertTrue(FocusPolicy.shouldReclaim("com.peloton.launcher", self))
        assertTrue(FocusPolicy.shouldReclaim("com.onepeloton.odyssey", self))
        assertTrue(FocusPolicy.shouldReclaim("com.peloton", self))
    }

    @Test
    fun leavesNetflixAndOurselvesAndOthersAlone() {
        assertFalse("Netflix is launched on purpose", FocusPolicy.shouldReclaim("com.netflix.mediaclient", self))
        assertFalse("our own app", FocusPolicy.shouldReclaim(self, self))
        assertFalse("some other app", FocusPolicy.shouldReclaim("org.schabi.newpipe", self))
        assertFalse("nothing reported", FocusPolicy.shouldReclaim(null, self))
        assertFalse("empty", FocusPolicy.shouldReclaim("", self))
    }

    @Test
    fun standsDownWhileTheRiderOpenedPelotonOnPurpose() {
        assertFalse(FocusPolicy.shouldReclaim("com.peloton.launcher", self, standDown = true))
        assertTrue(FocusPolicy.shouldReclaim("com.peloton.launcher", self, standDown = false))
    }

    @Test
    fun doesNotMatchOnPrefixCollision() {
        // A third-party package that merely starts with the letters "com.peloton" but is not under it must not trigger a reclaim.
        assertFalse(FocusPolicy.shouldReclaim("com.pelotonfan.app", self))
    }
}
