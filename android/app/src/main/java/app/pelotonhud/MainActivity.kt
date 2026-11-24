package app.pelotonhud

import android.annotation.SuppressLint
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.MotionEvent
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.widget.FrameLayout
import kotlin.math.roundToInt
import android.webkit.ConsoleMessage
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebMessagePortCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

/**
 * Full-screen WebView showing the web app (HUD and YouTube). On page load it opens a message port to the page (src/bridge/android.ts),
 * starts the sensor and streams live samples over the port. It also routes the web app's commands: "openApp" launches a media app
 * (by package) full screen and draws a native stats strip over it (NetflixOverlay); "closeOverlay" tears that down and brings the HUD back.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private var port: WebMessagePortCompat? = null
    // The live-data source (Settings → Sensor): the bike's own sensor service, or a Bluetooth LE sensor the rider picked (saved address).
    private lateinit var sensor: RideSensor
    private val bleScanner by lazy { BleScanner(this) }
    private val foundSensors = mutableListOf<BleScanner.Found>()
    private var scanning = false
    private var scanAfterPermission = false
    private val audio by lazy { getSystemService(Context.AUDIO_SERVICE) as AudioManager }
    private val overlay by lazy {
        NetflixOverlay(
            this,
            onHome = { exitOverlay("home") },
            // System-wide Back for the app in front (navigates inside SmartTube etc.). If the accessibility service isn't enabled, fall back
            // to leaving the app for the HUD, so the button is never dead.
            onBack = { if (!BackAccessibilityService.back()) exitOverlay("home") },
            onToggleRide = { toggleRideFromOverlay() },
            onSetVolume = { setVolume(it) },
            onSetBrightness = { setBrightness(it) },
        )
    }
    private var lastSample = SensorSource.Sample(0, 0, 0)
    private var helloSent = false

    // The native way out (RecoveryScreen): shown when the HUD fails to load or its renderer dies, or on a 3 s hold in the top-left corner.
    private lateinit var recovery: RecoveryScreen
    private var loadFailed = false
    private var rendererGone = false
    private val cornerHold by lazy {
        val d = resources.displayMetrics.density
        CornerHold(cornerPx = 72 * d, slopPx = 24 * d, holdMs = CORNER_HOLD_MS)
    }
    private val cornerCheck = Runnable { if (cornerHold.fired(System.currentTimeMillis())) showRecovery(manual = true) }

    // One-time move of saved data from the origin the HUD used to load from (BuildConfig.LEGACY_ORIGIN, set only in local.properties).
    private val prefs by lazy { getSharedPreferences("hud", Context.MODE_PRIVATE) }
    private val legacyHost: String? by lazy { BuildConfig.LEGACY_ORIGIN.takeIf { it.isNotEmpty() }?.let { Uri.parse(it).host } }
    private var migrating = false
    private var pendingLegacy: Map<String, String>? = null
    private val migrationTimeout = Runnable { finishMigration() }

    // Serves the web bundled in the APK (assets/, from the copyWebAssets Gradle task) over a real https origin. Release builds load the HUD
    // from here, so it needs no internet to run (only the media apps do).
    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    // Volume can change from the hardware keys while any app is in front; this fires in-process (the overlay keeps us alive) so we can keep
    // the HUD's and the overlay's volume sliders in sync with the real device. VOLUME_CHANGED_ACTION is undocumented but stable across
    // Android versions; if it ever stops arriving, the levels still refresh on every return to the HUD (onResume).
    private val volumeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            post(levelsMessage())
            if (overlay.isShowing) overlay.setLevels(volumeLevel(), brightnessLevel())
        }
    }

    // Ride recording survives behind Netflix: while a ride is recording AND the Netflix overlay is up, MainActivity is stopped and the
    // WebView's 1 Hz recorder tick (src/ride/useRide.ts) is frozen, so we buffer one sample per second here (the sensor callback and this
    // handler keep running on the main looper) and replay the batch to the web recorder on return — no gap, and the metric math stays web-side.
    private val mainHandler = Handler(Looper.getMainLooper())
    private val rideBuffer = mutableListOf<SensorSource.Sample>()
    private var recording = false
    private var buffering = false
    // A ride was started from the overlay's Start button while an app was in front: on the next flush we tell the web to start the recorder
    // (Messages.rideStarted) just before replaying the buffered seconds, so the ride is reconstructed from its true start with no gap.
    private var pendingStart = false
    private val bufferTick = object : Runnable {
        override fun run() {
            rideBuffer.add(lastSample)
            overlay.advance(lastSample.power) // mirror the web recorder: +1s and +power/1000 kJ, so the overlay's TIME/OUTPUT track the ride.
            mainHandler.postDelayed(this, 1000)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sensor = makeSensor()
        web = WebView(this)
        recovery = RecoveryScreen(
            this,
            onRetry = { retryHud() },
            onAndroidSettings = { openAndroidSettings() },
            onChooseHome = { chooseHomeApp() },
            onOpenPeloton = { openPeloton() },
            onClose = { recovery.hide() },
        ).apply { hide() }
        setContentView(
            FrameLayout(this).apply {
                addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                addView(recovery, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            },
        )
        applySystemBars() // After setContentView: the decor view (and its insets controller) does not exist before the window has content.
        // Keep the HUD clear of the system navigation bar (kept visible on purpose — see applySystemBars) and of the on-screen keypad: pad the
        // WebView's bottom by whichever is taller. The web side then scrolls a focused settings field into view above the keypad.
        web.setOnApplyWindowInsetsListener { v, insets ->
            val ime = insets.getInsets(WindowInsets.Type.ime()).bottom
            val nav = insets.getInsets(WindowInsets.Type.navigationBars()).bottom
            v.setPadding(0, 0, 0, maxOf(ime, nav))
            insets
        }
        // Kiosk guard: keep the bike on our software even if a Peloton app foregrounds itself (docs/SOFTWARE-PLAN.md step 9).
        GuardService.start(this)
        registerReceiver(volumeReceiver, IntentFilter("android.media.VOLUME_CHANGED_ACTION"))
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        // YouTube must be able to start playing without a tap on the video itself.
        web.settings.mediaPlaybackRequiresUserGesture = false
        web.settings.userAgentString = "${web.settings.userAgentString} PelotonHud/${BuildConfig.VERSION_NAME}"
        WebView.setWebContentsDebuggingEnabled(true)
        // Surface the page's console (and uncaught errors) in logcat under "PelotonHudWeb" so `npm run bike -- logs` shows them.
        web.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(m: ConsoleMessage): Boolean {
                Log.w("PelotonHudWeb", "${m.messageLevel()} ${m.message()} (${m.sourceId()}:${m.lineNumber()})")
                return true
            }
        }
        web.webViewClient = object : WebViewClient() {
            // Serve the HUD bundled in the APK (release WEB_URL is the appassets origin) through the asset loader; YouTube and the media apps
            // still go to the network. So the HUD boots with no internet.
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? = when {
                request.url.host == APPASSETS_HOST -> assetLoader.shouldInterceptRequest(request.url)
                // During the one-time data move, the old origin is a blank local page: we only need its storage, never the network.
                migrating && request.url.host == legacyHost ->
                    WebResourceResponse("text/html", "utf-8", "<!doctype html><title>Moving your rides</title>".byteInputStream())
                else -> null
            }

            override fun onPageFinished(view: WebView, url: String) {
                val host = Uri.parse(url).host
                when {
                    migrating && host == legacyHost -> readLegacy()
                    migrating -> {} // an error page during the move; the timeout carries on to the HUD
                    pendingLegacy != null && host == APPASSETS_HOST -> writeLegacy()
                    loadFailed -> {} // the recovery screen is up; there is no HUD page to talk to
                    else -> connectPort()
                }
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (!request.isForMainFrame) return
                if (migrating) return finishMigration() // the old origin is optional; never block the HUD on it
                Log.w(TAG, "HUD failed to load: ${error.errorCode} ${error.description}")
                loadFailed = true
                showRecovery(manual = false, why = "The HUD page didn't load (${error.description}).")
            }

            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                if (!request.isForMainFrame || migrating) return
                loadFailed = true
                showRecovery(manual = false, why = "The HUD page didn't load (HTTP ${response.statusCode}).")
            }

            // The page's renderer crashed or was killed for memory. Returning true keeps the app alive; the WebView is unusable until Retry
            // rebuilds the activity.
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                Log.w(TAG, "WebView renderer gone (crashed=${detail.didCrash()})")
                rendererGone = true
                loadFailed = true
                showRecovery(manual = false, why = "The HUD stopped unexpectedly.")
                return true
            }
        }
        if (legacyHost != null && BuildConfig.WEB_URL.contains(APPASSETS_HOST) && !prefs.getBoolean(PREF_LEGACY_MOVED, false)) {
            startMigration()
        } else {
            web.loadUrl(BuildConfig.WEB_URL)
        }
    }

    /** Open the old origin (served as a blank local page) so its saved data can be read; the HUD loads right after, or after a timeout. */
    private fun startMigration() {
        migrating = true
        mainHandler.postDelayed(migrationTimeout, MIGRATION_TIMEOUT_MS)
        web.loadUrl("${BuildConfig.LEGACY_ORIGIN}/")
    }

    private fun readLegacy() {
        web.evaluateJavascript(LegacyStorage.READ_JS) { result ->
            pendingLegacy = LegacyStorage.parse(result, legacyHost ?: "")
            Log.w(TAG, "legacy data: ${pendingLegacy?.keys ?: "unreadable"}")
            // Drop the old origin's service worker, if any: nothing will be served from there again.
            web.evaluateJavascript("navigator.serviceWorker&&navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister()})})", null)
            finishMigration()
        }
    }

    private fun finishMigration() {
        if (!migrating) return
        migrating = false
        mainHandler.removeCallbacks(migrationTimeout)
        web.loadUrl(BuildConfig.WEB_URL)
    }

    /** Write the carried-over keys into the HUD's origin (only where missing), mark the move done, and reload so the app reads them. */
    private fun writeLegacy() {
        val data = pendingLegacy ?: return
        pendingLegacy = null
        if (data.isEmpty()) {
            prefs.edit().putBoolean(PREF_LEGACY_MOVED, true).apply()
            connectPort()
            return
        }
        web.evaluateJavascript(LegacyStorage.writeJs(data)) { ok ->
            if (ok == "true") prefs.edit().putBoolean(PREF_LEGACY_MOVED, true).apply()
            Log.w(TAG, "legacy data moved: $ok (${data.size} keys)")
            web.reload()
        }
    }

    /** Bring up the native recovery screen. `manual` = the rider asked for it (corner hold), so the HUD is fine and they can go back. */
    private fun showRecovery(manual: Boolean, why: String = "") {
        if (manual) {
            recovery.show("Peloton HUD", "Need to get out? Open Android settings, pick a different home app, or open Peloton's app.", canClose = true)
        } else {
            recovery.show("The HUD couldn't start", "$why Check the Wi-Fi in Android settings if you need the media apps, then Retry.", canClose = false)
        }
    }

    /** Retry from the recovery screen: rebuild the activity if the renderer died, else just reload the HUD. */
    private fun retryHud() {
        if (rendererGone) return recreate()
        loadFailed = false
        recovery.hide()
        web.loadUrl(BuildConfig.WEB_URL)
    }

    private fun openAndroidSettings() {
        startSafely(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** Android's own "Default home app" picker: the no-adb way to switch the bike back to Peloton's launcher (or back to the HUD). */
    private fun chooseHomeApp() {
        if (!startSafely(Intent(Settings.ACTION_HOME_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))) openAndroidSettings()
    }

    /** Open Peloton's own home screen. The kiosk guard stands down until the HUD comes back (Home button), so it doesn't bounce it away. */
    private fun openPeloton() {
        val homes = packageManager
            .queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0)
            .map { PelotonApps.Home(it.activityInfo.packageName, it.activityInfo.name) }
        val home = PelotonApps.pickHome(homes, packageName)
        if (home == null) {
            post(Messages.error("peloton", "Couldn't find Peloton's app on this device"))
            return
        }
        GuardService.standDown = true
        val ok = startSafely(Intent(Intent.ACTION_MAIN).setClassName(home.pkg, home.cls).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        if (!ok) {
            GuardService.standDown = false
            post(Messages.error("peloton", "Couldn't open ${home.pkg}"))
        }
    }

    // Watch every touch for the corner-hold escape gesture without consuming any, so taps in the corner still reach the page.
    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                cornerHold.down(ev.x, ev.y, System.currentTimeMillis())
                mainHandler.removeCallbacks(cornerCheck)
                if (cornerHold.armed) mainHandler.postDelayed(cornerCheck, CORNER_HOLD_MS)
            }
            MotionEvent.ACTION_MOVE -> cornerHold.move(ev.x, ev.y)
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_POINTER_DOWN -> {
                cornerHold.cancel()
                mainHandler.removeCallbacks(cornerCheck)
            }
        }
        return super.dispatchTouchEvent(ev)
    }

    /** Hand the page one end of a message channel, then start the sensor and feed samples down it. */
    private fun connectPort() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.CREATE_WEB_MESSAGE_CHANNEL)) return
        port?.close()
        helloSent = false
        recording = false
        pendingStart = false
        stopBuffering()
        rideBuffer.clear()
        val (ours, theirs) = WebViewCompat.createWebMessageChannel(web)
        ours.setWebMessageCallback(object : WebMessagePortCompat.WebMessageCallbackCompat() {
            override fun onMessage(p: WebMessagePortCompat, message: WebMessageCompat?) {
                val data = message?.data ?: return
                val type = runCatching { JSONObject(data).optString("type") }.getOrNull() ?: return
                val o = runCatching { JSONObject(data) }.getOrNull()
                when (type) {
                    "openApp" -> o?.optString("pkg")?.takeIf { it.isNotEmpty() }
                        ?.let { openApp(it, o.optInt("elapsedSec", 0), o.optDouble("outputKj", 0.0), o.optDouble("weightKg", 0.0), parsePlan(o), o.optBoolean("hidesNav", false)) }
                    "queryApps" -> queryApps(o)
                    "queryInstalledApps" -> queryInstalledApps()
                    "closeOverlay" -> exitOverlay("home")
                    "setVolume" -> o?.let { setVolume(it.optDouble("level", Double.NaN)) }
                    "setBrightness" -> o?.let { setBrightness(it.optDouble("level", Double.NaN)) }
                    // Track whether a ride is recording so we know to buffer samples behind the overlay. pause/resume stay web-side: the
                    // recorder applies them when it replays the buffer, so we keep buffering (zeros and all) between start and end.
                    "startRide" -> { recording = true; if (overlay.isShowing) overlay.setRecording(true) }
                    "endRide" -> { recording = false; stopBuffering(); if (overlay.isShowing) overlay.setRecording(false) }
                    // The way out, from the HUD's Settings screen (the same actions as the native recovery screen).
                    "openPeloton" -> openPeloton()
                    "openAndroidSettings" -> openAndroidSettings()
                    "chooseHomeApp" -> chooseHomeApp()
                    "scanSensors" -> scanSensors()
                    "useSensor" -> o?.optString("id")?.takeIf { it.isNotEmpty() }?.let { useSensor(it, o.optString("name")) }
                }
            }
        })
        WebViewCompat.postWebMessage(web, WebMessageCompat(Messages.PORT_HANDSHAKE, arrayOf(theirs)), Uri.parse("*"))
        port = ours
        startSensor()
        post(levelsMessage()) // Seed the HUD's volume/brightness controls with the real device state.
        postSensors()
    }

    /** The saved choice: a Bluetooth sensor's address, or the bike's own sensor service when none is saved. */
    private fun makeSensor(): RideSensor =
        prefs.getString(PREF_BLE_ADDRESS, null)?.let { BleSource(this, it) } ?: SensorSource(this)

    /** Tell Settings → Sensor what is in use, whether a scan is running, and what it has found so far. */
    private fun postSensors(error: String? = null) {
        val current = prefs.getString(PREF_BLE_ADDRESS, null)
        post(
            Messages.sensors(
                current = current ?: "internal",
                currentName = if (current != null) prefs.getString(PREF_BLE_NAME, null) ?: current else "Bike's built-in sensor",
                scanning = scanning,
                devices = foundSensors.toList(),
                error = error,
            ),
        )
    }

    /** Look for Bluetooth power meters and cadence sensors for ~12 s, reporting each one as it appears. */
    private fun scanSensors() {
        if (scanning) return
        when {
            !bleScanner.available -> return postSensors("This tablet has no Bluetooth.")
            !bleScanner.enabled -> return postSensors("Bluetooth is off. Turn it on in Android settings, then scan again.")
            checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED -> {
                scanAfterPermission = true
                requestPermissions(arrayOf(android.Manifest.permission.ACCESS_FINE_LOCATION), REQ_LOCATION)
                return
            }
            !locationOn() -> return postSensors("Android needs Location turned on to find Bluetooth sensors. Turn it on in Android settings.")
        }
        scanning = true
        foundSensors.clear()
        postSensors()
        bleScanner.scan(
            SCAN_MS,
            onFound = { foundSensors.add(it); postSensors() },
            onDone = { scanning = false; postSensors() },
        )
    }

    private fun locationOn(): Boolean =
        (getSystemService(Context.LOCATION_SERVICE) as? android.location.LocationManager)?.isLocationEnabled ?: true

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQ_LOCATION || !scanAfterPermission) return
        scanAfterPermission = false
        if (grantResults.firstOrNull() == android.content.pm.PackageManager.PERMISSION_GRANTED) scanSensors()
        else postSensors("Scanning for Bluetooth sensors needs the location permission.")
    }

    /** Switch the live-data source ("internal" = the bike's own sensor) and remember it. */
    private fun useSensor(id: String, name: String) {
        bleScanner.stop()
        scanning = false
        prefs.edit().apply {
            if (id == "internal") remove(PREF_BLE_ADDRESS).remove(PREF_BLE_NAME)
            else putString(PREF_BLE_ADDRESS, id).putString(PREF_BLE_NAME, name.ifEmpty { id })
        }.apply()
        sensor.stop()
        sensor = makeSensor()
        helloSent = false
        startSensor()
        postSensors()
    }

    /** Set the music-stream volume from a 0..1 level (clamped), then echo the applied level back to the HUD (and the overlay slider). */
    private fun setVolume(level: Double) {
        if (level.isNaN()) return
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        audio.setStreamVolume(AudioManager.STREAM_MUSIC, (level.coerceIn(0.0, 1.0) * max).roundToInt(), 0)
        syncLevels()
    }

    /** Set system screen brightness from a 0..1 level, clamped so it never goes fully dark, then echo the applied level back. */
    private fun setBrightness(level: Double) {
        if (level.isNaN()) return
        if (!Settings.System.canWrite(this)) {
            post(Messages.error("brightness", "Allow changing system settings first (npm run bike -- setup)"))
            return
        }
        val value = (level.coerceIn(0.0, 1.0) * 255).roundToInt().coerceIn(MIN_BRIGHTNESS, 255)
        Settings.System.putInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL)
        Settings.System.putInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS, value)
        syncLevels()
    }

    private fun volumeLevel(): Double {
        val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
        return audio.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max
    }

    private fun brightnessLevel(): Double =
        runCatching { Settings.System.getInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS) }.getOrDefault(128) / 255.0

    /** The current volume and brightness as 0..1, for the `levels` message. */
    private fun levelsMessage(): String = Messages.levels(volumeLevel(), brightnessLevel())

    /** Push the real device levels to both the HUD (over the port) and the overlay's sliders, so all three stay in sync. */
    private fun syncLevels() {
        post(levelsMessage())
        if (overlay.isShowing) overlay.setLevels(volumeLevel(), brightnessLevel())
    }

    private fun startSensor() {
        sensor.stop()
        sensor.start(
            onSample = { s ->
                lastSample = s
                if (overlay.isShowing) overlay.update(s.power, s.cadence, s.resistance)
                post(Messages.sample(System.currentTimeMillis(), s.power, s.cadence, s.resistance))
            },
            onStatus = { connected ->
                if (!helloSent) {
                    helloSent = true
                    post(
                        Messages.hello(
                            BuildConfig.VERSION_NAME,
                            Build.MODEL,
                            if (connected) sensor.kind else "none",
                            android = Build.VERSION.RELEASE ?: "",
                            abi = Build.SUPPORTED_ABIS?.firstOrNull() ?: "",
                        ),
                    )
                }
                if (!connected) {
                    post(Messages.error("sensor", if (sensor.kind == "ble") "The Bluetooth sensor isn't connected (still trying)" else "SensorData did not connect"))
                }
            },
        )
    }

    /**
     * Launch a media app full screen by package name and draw the stats overlay over it. Recording keeps running via the N1 sample buffer
     * while the WebView is frozen behind the app, the same for every app. Most apps launch with their default launch intent; a few need a
     * specific activity (PelotonApps.DIRECT_ACTIVITY) — Netflix's default launcher resolves to Peloton's membership-gated wrapper, so we go
     * straight to Netflix's own launch activity, falling back to the package launcher only if that activity is gone. Apps other than Netflix
     * (the only one preinstalled) must be sideloaded first.
     */
    private fun openApp(pkg: String, seedElapsedSec: Int, seedOutputKj: Double, seedWeightKg: Double, plan: List<NetflixOverlay.PlanSeg>, hidesNav: Boolean) {
        if (!Settings.canDrawOverlays(this)) {
            post(Messages.error("overlay", "Allow drawing over other apps first (npm run bike -- setup)"))
            return
        }
        val direct = PelotonApps.DIRECT_ACTIVITY[pkg]?.let { Intent().setClassName(pkg, it).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        val launched = (direct != null && startSafely(direct)) ||
            startSafely(packageManager.getLaunchIntentForPackage(pkg)?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        if (!launched) {
            post(Messages.error("app", "Could not open that app — install it (sideload) and enable it in Settings, then try again."))
            return
        }
        showOverlay(seedElapsedSec, seedOutputKj, seedWeightKg, plan, hidesNav)
    }

    /** Answer the web's queryApps: of the packages it asked about, report those that are installed and launchable on this build. */
    private fun queryApps(o: JSONObject?) {
        val arr = o?.optJSONArray("pkgs") ?: return
        val candidates = (0 until arr.length()).mapNotNull { arr.optString(it).takeIf { s -> s.isNotEmpty() } }
        post(Messages.apps(PelotonApps.installed(candidates) { packageManager.getLaunchIntentForPackage(it) != null }))
    }

    /**
     * Answer the web's queryInstalledApps (Settings → Apps "Add an app"): every launchable app on the device, each with its real launcher icon,
     * so the user can add ANY sideloaded app as a home tile — the HUD isn't limited to the built-in catalog. We skip our own app and Peloton's
     * own launcher/system home (we don't want the kiosk launcher as a tile); the web filters out apps already in the catalog or already added.
     * Enumeration + icon rasterization runs off the main thread (dozens of icons) and posts the result back on the main looper.
     */
    private fun queryInstalledApps() {
        Thread {
            val pm = packageManager
            val main = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            val self = packageName
            val seen = HashSet<String>()
            val apps = ArrayList<Messages.InstalledApp>()
            for (ri in runCatching { pm.queryIntentActivities(main, 0) }.getOrDefault(emptyList())) {
                val pkg = ri.activityInfo?.packageName ?: continue
                if (pkg == self || FocusPolicy.isPeloton(pkg) || !seen.add(pkg)) continue
                val label = runCatching { ri.loadLabel(pm).toString() }.getOrNull()?.takeIf { it.isNotBlank() } ?: pkg
                val icon = runCatching { encodeIcon(ri.loadIcon(pm)) }.getOrNull()
                apps.add(Messages.InstalledApp(pkg, label, icon))
            }
            apps.sortBy { it.label.lowercase() }
            mainHandler.post { post(Messages.installedApps(apps)) }
        }.start()
    }

    /** Rasterize an app's launcher icon (adaptive or legacy) to a square PNG data URL, so the web can show it on the tile with no bundled asset. */
    private fun encodeIcon(d: android.graphics.drawable.Drawable, size: Int = 96): String {
        val bmp = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
        d.setBounds(0, 0, size, size)
        d.draw(android.graphics.Canvas(bmp))
        val out = java.io.ByteArrayOutputStream()
        bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out)
        bmp.recycle()
        return "data:image/png;base64," + android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP)
    }

    /** Parse the optional power plan handed with openApp — a JSON array of {durationSec, targetW} — so the overlay can draw the
     *  guide gauge and advance its target while the WebView is frozen. Absent/unreadable → no plan (no gauge). */
    private fun parsePlan(o: JSONObject?): List<NetflixOverlay.PlanSeg> {
        val arr = o?.optJSONArray("plan") ?: return emptyList()
        val out = ArrayList<NetflixOverlay.PlanSeg>(arr.length())
        for (i in 0 until arr.length()) {
            val s = arr.optJSONObject(i) ?: continue
            out.add(NetflixOverlay.PlanSeg(s.optInt("durationSec", 0), s.optInt("targetW", 0)))
        }
        return out
    }

    /** Draw the shared stats overlay over whichever app was just launched, seeded with the ride so TIME/OUTPUT/CAL continue it, and (if a ride
     *  is recording) start buffering so it keeps recording while the WebView is frozen behind that app. */
    private fun showOverlay(seedElapsedSec: Int, seedOutputKj: Double, seedWeightKg: Double, plan: List<NetflixOverlay.PlanSeg>, hidesNav: Boolean = false) {
        overlay.show(seedElapsedSec, seedOutputKj, seedWeightKg, recording, plan, hidesNav)
        overlay.update(lastSample.power, lastSample.cadence, lastSample.resistance)
        overlay.setLevels(volumeLevel(), brightnessLevel())
        rideBuffer.clear() // fresh behind-app session; the buffer accumulates across pause/resume until the overlay is dismissed.
        if (recording) startBuffering()
    }

    private fun startSafely(intent: Intent?): Boolean {
        if (intent == null) return false
        return try {
            startActivity(intent)
            true
        } catch (e: Exception) {
            Log.w(TAG, "launch failed (${intent.component}): ${e.message}")
            false
        }
    }

    /** Hide the overlay, bring the HUD back to the front, and tell the web where to land (`nav`; always "home" now — the overlay has no
     *  Back, so leaving Netflix/Kindle any way returns to the HUD). The ride is untouched — it keeps recording; only Stop ends it. */
    private fun exitOverlay(nav: String) {
        if (!overlay.isShowing) return
        flushRideBuffer() // replay the seconds recorded behind the app into the web recorder before the HUD comes back (ride continues)
        overlay.hide()
        startActivity(
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        )
        post(Messages.overlayClosed(nav))
    }

    private fun post(json: String) {
        port?.postMessage(WebMessageCompat(json))
    }

    /** Append the latest reading to the ride buffer once a second while the HUD is behind another app. Runs on the main looper, which stays
     *  live. The buffer is cleared when the overlay opens and when it flushes — never here, so pausing and resuming keeps the seconds so far. */
    private fun startBuffering() {
        if (buffering) return
        buffering = true
        mainHandler.postDelayed(bufferTick, 1000)
    }

    /** The overlay's Start/Stop button. Start: begin a ride behind the app and keep watching — the overlay counts from zero and we buffer,
     *  telling the web on the next flush (pendingStart → rideStarted). Stop: end and save the ride, then return to the HUD so the save runs
     *  with the WebView in front (reliable); the web is frozen behind the app, so we don't try to end it there. */
    private fun toggleRideFromOverlay() {
        if (recording) {
            recording = false
            overlay.setRecording(false)
            flushRideBuffer() // posts any pending start + the buffered seconds
            post(Messages.rideEnded())
            exitOverlay("home")
        } else {
            recording = true
            pendingStart = true
            rideBuffer.clear()
            overlay.resetRide()
            overlay.setRecording(true)
            startBuffering()
        }
    }

    private fun stopBuffering() {
        buffering = false
        mainHandler.removeCallbacks(bufferTick)
    }

    /** Hand the web the seconds recorded behind the app so the recorder can replay them; then clear the buffer. A ride started from the
     *  overlay (pendingStart) is announced first, so the web starts the recorder before the replay — the ride is rebuilt from its true start. */
    private fun flushRideBuffer() {
        stopBuffering()
        if (pendingStart) {
            post(Messages.rideStarted())
            pendingStart = false
        }
        if (rideBuffer.isNotEmpty()) {
            post(Messages.samples(rideBuffer.toList()))
            rideBuffer.clear()
        }
    }

    override fun onResume() {
        super.onResume()
        // The HUD is back in front (e.g. Home after "Open Peloton app"): the kiosk guard resumes keeping Peloton's apps away.
        GuardService.standDown = false
        // Returning to the HUD any other way (home, recents) also dismisses the overlay and lands on the HUD.
        if (overlay.isShowing) {
            exitOverlay("home")
        } else if (NetflixOverlay.dismissStale(this)) {
            // An overlay window from a prior activity instance was still attached over the HUD (orphaned) — remove it and make sure the
            // web has left the media view, so the HUD home never shows the media stats bar on top of its own stats.
            post(Messages.overlayClosed("home"))
        }
        // Volume/brightness may have changed (hardware keys) while we were away — refresh the HUD's sliders.
        post(levelsMessage())
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            applySystemBars()
            // Belt-and-suspenders for the orphaned-overlay case: if the HUD has focus, we're on the HUD, so no media overlay should be
            // attached. Remove any that a prior (destroyed) activity instance left behind, which onResume's own check can miss.
            if (!overlay.isShowing && NetflixOverlay.dismissStale(this)) post(Messages.overlayClosed("home"))
        }
    }

    // The HUD is the bike's launcher, so BACK must never drop out to Peloton: close the Netflix overlay, else step back through the web
    // app's own history, else swallow it.
    @Suppress("OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        when {
            recovery.isShowing && !loadFailed -> recovery.hide()
            overlay.isShowing -> exitOverlay("home")
            web.canGoBack() -> web.goBack()
            else -> {}
        }
    }

    /**
     * Keep the system navigation bar (Back / Home / Recents) visible across the HUD. The bike's launcher can't remove it without root, and
     * riders rely on it to navigate sideloaded apps like SmartTube that offer no on-screen Back of their own — so we show it everywhere
     * rather than hide it. The status bar stays hidden (the HUD has its own top bar). Edge-to-edge layout with the nav bar's inset padded
     * out in the WebView's insets listener, so HUD content never sits under the bar.
     */
    private fun applySystemBars() {
        window.setDecorFitsSystemWindows(false)
        window.insetsController?.let {
            it.show(WindowInsets.Type.navigationBars())
            it.hide(WindowInsets.Type.statusBars())
            it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    override fun onDestroy() {
        stopBuffering()
        mainHandler.removeCallbacks(cornerCheck)
        mainHandler.removeCallbacks(migrationTimeout)
        if (scanning) bleScanner.stop()
        overlay.hide()
        sensor.stop()
        runCatching { unregisterReceiver(volumeReceiver) }
        port?.close()
        web.destroy()
        super.onDestroy()
    }

    companion object {
        const val TAG = "PelotonHud"
        // The origin the HUD is served from, out of the APK's assets via WebViewAssetLoader (release WEB_URL points here).
        private const val APPASSETS_HOST = "appassets.androidplatform.net"
        // Never let the HUD's brightness slider take the screen fully dark — there would be no way to see it to turn it back up.
        private const val MIN_BRIGHTNESS = 12
        private const val CORNER_HOLD_MS = 3000L
        private const val MIGRATION_TIMEOUT_MS = 8000L
        private const val PREF_LEGACY_MOVED = "legacyMoved"
        private const val PREF_BLE_ADDRESS = "bleAddress"
        private const val PREF_BLE_NAME = "bleName"
        private const val REQ_LOCATION = 7
        private const val SCAN_MS = 12000L
    }
}
