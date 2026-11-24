package app.pelotonhud

import org.json.JSONArray
import org.json.JSONObject

/** Shell → web messages. Must match docs/DATA-CONTRACT.md and src/bridge/types.ts. */
object Messages {
    const val PORT_HANDSHAKE = "peloton-hud:port"

    fun hello(shellVersion: String, device: String, sensor: String, android: String = "", abi: String = ""): String =
        JSONObject().put("type", "hello").put("shellVersion", shellVersion).put("device", device).put("sensor", sensor)
            .apply { if (android.isNotEmpty()) put("android", android); if (abi.isNotEmpty()) put("abi", abi) }.toString()

    fun sample(t: Long, power: Int, cadence: Int, resistance: Int, hr: Int? = null): String =
        JSONObject().put("type", "sample").put("t", t).put("power", power).put("cadence", cadence).put("resistance", resistance)
            .apply { if (hr != null) put("hr", hr) }.toString()

    fun ride(rideId: String, state: String, startedAt: Long? = null): String =
        JSONObject().put("type", "ride").put("rideId", rideId).put("state", state)
            .apply { if (startedAt != null) put("startedAt", startedAt) }.toString()

    fun error(code: String, message: String): String =
        JSONObject().put("type", "error").put("code", code).put("message", message).toString()

    /** The overlay was dismissed; `nav` tells the web where to land — "home" (the HUD) or "select" (the media picker). The native
     *  entertainment overlay only ever sends "home" (it has no Back); "select" stays in the contract for the in-WebView YouTube bar. */
    fun overlayClosed(nav: String = "home"): String = JSONObject().put("type", "overlayClosed").put("nav", nav).toString()

    /** The overlay's Start button began a ride behind an entertainment app; the web starts the recorder (buffered samples follow). */
    fun rideStarted(): String = JSONObject().put("type", "rideStarted").toString()

    /** The overlay's Stop button ended the ride; the web ends the recorder and saves (buffered samples are flushed just before this). */
    fun rideEnded(): String = JSONObject().put("type", "rideEnded").toString()

    /** Current audio volume and screen brightness, each 0..1, so the HUD's controls reflect the real device state. */
    fun levels(volume: Double, brightness: Double): String =
        JSONObject().put("type", "levels").put("volume", volume).put("brightness", brightness).toString()

    /** Which of the media-app packages the web asked about (queryApps) are installed and launchable here, so the HUD shows a button only
     *  for apps that are actually on the bike. */
    fun apps(installed: List<String>): String {
        val arr = JSONArray()
        for (p in installed) arr.put(p)
        return JSONObject().put("type", "apps").put("installed", arr).toString()
    }

    /** A launchable app the user could add as a custom home tile: its package, display label, and (optional) launcher icon as a PNG data URL. */
    data class InstalledApp(val pkg: String, val label: String, val icon: String?)

    /** Settings → Apps "Add an app": every launchable app on the device (minus our own and Peloton's own launcher), each with its real icon,
     *  so the web can offer any installed app as a home tile — the HUD is extensible to any sideloaded APK, not just the built-in catalog. */
    fun installedApps(apps: List<InstalledApp>): String {
        val arr = JSONArray()
        for (a in apps) arr.put(JSONObject().put("pkg", a.pkg).put("label", a.label).apply { if (a.icon != null) put("icon", a.icon) })
        return JSONObject().put("type", "installedApps").put("apps", arr).toString()
    }

    /** Settings → Sensor: the source in use ("internal" or a Bluetooth address), whether a scan is running, what it found, any problem. */
    fun sensors(current: String, currentName: String, scanning: Boolean, devices: List<BleScanner.Found>, error: String? = null): String {
        val arr = JSONArray()
        for (d in devices) arr.put(JSONObject().put("id", d.address).put("name", d.name).put("kind", d.kind))
        return JSONObject().put("type", "sensors").put("current", current).put("currentName", currentName).put("scanning", scanning)
            .put("devices", arr).apply { if (error != null) put("error", error) }.toString()
    }

    /** A batch of 1 Hz samples buffered while a ride kept recording behind the Netflix overlay; the web replays them into the recorder. */
    fun samples(buffered: List<SensorSource.Sample>): String {
        val arr = JSONArray()
        for (s in buffered) arr.put(JSONObject().put("power", s.power).put("cadence", s.cadence).put("resistance", s.resistance))
        return JSONObject().put("type", "samples").put("samples", arr).toString()
    }
}
