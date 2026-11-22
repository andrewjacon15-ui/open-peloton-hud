package app.pelotonhud

import org.json.JSONArray
import org.json.JSONObject

/**
 * One-time carry-over of the web app's saved data (rides, settings, subscriptions) from an origin the HUD used to be served from.
 * `localStorage` is per origin, so moving the HUD to the APK-bundled origin would otherwise make every saved ride look gone. MainActivity
 * opens a blank page on the old origin (served locally, no network), reads its `peloton-hud:*` keys with [READ_JS], then writes any that are
 * missing into the new origin with [writeJs]. The old origin comes from a build setting (`hud.legacyOrigin` in local.properties), so nothing
 * here names anyone's site; with no setting, nothing runs. Pure string/JSON work, unit-tested.
 */
object LegacyStorage {
    private const val PREFIX = "peloton-hud:"

    /** Returns a JSON string `{host, data}` of every `peloton-hud:*` key on the current origin, or null if storage is unreadable. */
    const val READ_JS = "(function(){try{var o={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);" +
        "if(k&&k.indexOf('$PREFIX')===0)o[k]=localStorage.getItem(k);}" +
        "return JSON.stringify({host:location.host,data:o});}catch(e){return null;}})()"

    /**
     * Decode what `evaluateJavascript(READ_JS)` handed back: a JSON-encoded string, or "null". Returns the keys, or null when the read failed
     * or ran on the wrong page (e.g. an error page), so the caller can try again on the next launch instead of marking the move done.
     */
    fun parse(result: String?, expectedHost: String): Map<String, String>? {
        if (result.isNullOrBlank() || result == "null") return null
        val text = runCatching { JSONArray("[$result]").getString(0) }.getOrNull() ?: return null
        val o = runCatching { JSONObject(text) }.getOrNull() ?: return null
        if (o.optString("host") != expectedHost) return null
        val data = o.optJSONObject("data") ?: return emptyMap()
        val out = LinkedHashMap<String, String>()
        for (k in data.keys()) if (k.startsWith(PREFIX)) out[k] = data.optString(k)
        return out
    }

    /** JS that stores each key on the current origin only where it is not already set (never overwrites newer data). */
    fun writeJs(data: Map<String, String>): String {
        val o = JSONObject()
        for ((k, v) in data) o.put(k, v)
        return "(function(d){try{for(var k in d){if(localStorage.getItem(k)===null)localStorage.setItem(k,d[k]);}return true;}" +
            "catch(e){return false;}})($o)"
    }
}
