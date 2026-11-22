package app.pelotonhud

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log

/**
 * Kiosk guard: a foreground service that keeps the bike on our software. Every ~1.5s it asks UsageStatsManager which app most recently came
 * to the foreground; if it is one of Peloton's own apps (FocusPolicy), it pulls the HUD back to the front. It deliberately leaves Netflix
 * alone — that is launched on purpose and draws our stats overlay on top — and does nothing while our own app is in front. Needs
 * PACKAGE_USAGE_STATS (granted over adb by `npm run bike -- setup`); without it queryEvents is empty and the guard is simply inert.
 */
class GuardService : Service() {
    private val main = Handler(Looper.getMainLooper())
    private val usage by lazy { getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager }
    private val self by lazy { packageName }

    private val tick = object : Runnable {
        override fun run() {
            runCatching { reclaimIfNeeded() }.onFailure { Log.w(TAG, "guard tick failed: ${it.message}") }
            main.postDelayed(this, INTERVAL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        startForeground(NOTIF_ID, notification())
        main.post(tick)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        main.removeCallbacks(tick)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    /** Find the most recent foregrounded package in the last few seconds and bounce back to the HUD if it is Peloton's. */
    private fun reclaimIfNeeded() {
        val now = System.currentTimeMillis()
        val events = usage.queryEvents(now - LOOKBACK_MS, now)
        var latest: String? = null
        val event = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.ACTIVITY_RESUMED) latest = event.packageName
        }
        if (FocusPolicy.shouldReclaim(latest, self, standDown)) {
            Log.w(TAG, "reclaiming focus from $latest")
            startActivity(
                Intent(this, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            )
        }
    }

    private fun notification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(NotificationChannel(CHANNEL, "Peloton HUD", NotificationManager.IMPORTANCE_MIN))
        }
        return Notification.Builder(this, CHANNEL)
            .setContentTitle("Peloton HUD")
            .setContentText("Keeping the bike on your software")
            .setSmallIcon(android.R.drawable.ic_media_play)
            .build()
    }

    companion object {
        const val TAG = "PelotonHudGuard"
        private const val CHANNEL = "hud-guard"
        private const val NOTIF_ID = 42
        private const val INTERVAL_MS = 1500L
        private const val LOOKBACK_MS = 5000L

        /** True while the rider has opened Peloton on purpose ("Open Peloton app"); MainActivity clears it when the HUD comes back. */
        @Volatile var standDown = false

        fun start(context: Context) {
            val intent = Intent(context, GuardService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
        }
    }
}
