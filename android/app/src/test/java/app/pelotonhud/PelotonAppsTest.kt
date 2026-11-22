package app.pelotonhud

import app.pelotonhud.PelotonApps.Home
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PelotonAppsTest {
    private val self = "app.pelotonhud"
    private val hud = Home(self, "app.pelotonhud.MainActivity")
    private val peloton = Home("com.peloton.launcher", "com.peloton.launcher.MainActivity")
    private val settingsFallback = Home("com.android.settings", "com.android.settings.FallbackHome")

    @Test
    fun prefersPelotonsLauncher() {
        assertEquals(peloton, PelotonApps.pickHome(listOf(hud, settingsFallback, peloton), self))
    }

    @Test
    fun fallsBackToAnyOtherHome() {
        assertEquals(settingsFallback, PelotonApps.pickHome(listOf(hud, settingsFallback), self))
    }

    @Test
    fun neverPicksOurselves() {
        assertNull(PelotonApps.pickHome(listOf(hud), self))
    }

    @Test
    fun installedKeepsOnlyLaunchablePackages() {
        val present = setOf("com.netflix.mediaclient", "com.amazon.kindle")
        val candidates = listOf("com.netflix.mediaclient", "com.google.android.youtube", "com.amazon.kindle")
        assertEquals(listOf("com.netflix.mediaclient", "com.amazon.kindle"), PelotonApps.installed(candidates) { it in present })
    }

    @Test
    fun netflixHasaDirectLaunchActivityButMostAppsDoNot() {
        assertEquals("com.netflix.mediaclient.ui.launch.NetflixComLaunchActivity", PelotonApps.DIRECT_ACTIVITY["com.netflix.mediaclient"])
        assertNull(PelotonApps.DIRECT_ACTIVITY["com.amazon.kindle"])
    }
}
