package app.pelotonhud

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent

/**
 * A do-nothing accessibility service that exists only so the HUD can perform a system-wide **Back** on demand. This is the one thing a normal
 * app cannot do for itself: inject a Back into whatever app is in front. The HUD's native overlay (NetflixOverlay) draws a Back button over
 * every launched media app, and sideloaded TV apps like SmartTube run fullscreen-immersive — they hide the system navigation bar and offer no
 * on-screen Back of their own — so without this a rider on the touchscreen has no way to step back inside them.
 *
 * It observes nothing and does not read screen content; `performGlobalAction(GLOBAL_ACTION_BACK)` is the whole point. The service is enabled
 * once over adb by the installer (`settings put secure enabled_accessibility_services …`, see installer/hud-setup.sh). When it is not enabled
 * the overlay's Back falls back to returning to the HUD, so the button is never dead.
 */
class BackAccessibilityService : AccessibilityService() {
    override fun onServiceConnected() {
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // We don't react to events — the service only exists to perform global actions on request.
    }

    override fun onInterrupt() {}

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        if (instance === this) instance = null
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    companion object {
        @Volatile
        private var instance: BackAccessibilityService? = null

        /** Whether the service is enabled and connected (so a system Back can be performed). */
        fun isReady(): Boolean = instance != null

        /** Perform a system-wide Back (as if the nav bar's Back were pressed). Returns false if the service isn't enabled. */
        fun back(): Boolean = instance?.performGlobalAction(GLOBAL_ACTION_BACK) ?: false
    }
}
