package app.pelotonhud

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LegacyStorageTest {
    /** What evaluateJavascript hands back for a JS string result: the string, JSON-encoded. */
    private fun jsString(s: String) = JSONArray().put(s).toString().removePrefix("[").removeSuffix("]")

    private fun dump(host: String, data: Map<String, String>) =
        jsString(JSONObject().put("host", host).put("data", JSONObject(data)).toString())

    @Test
    fun readsThePelotonHudKeysFromTheRightOrigin() {
        val rides = """[{"rideId":"20261101-070000-ab12"}]"""
        val got = LegacyStorage.parse(dump("old.example", mapOf("peloton-hud:rides" to rides, "other" to "x")), "old.example")
        assertEquals(mapOf("peloton-hud:rides" to rides), got)
    }

    @Test
    fun refusesTheWrongPageOrAFailedRead() {
        assertNull("error page / wrong origin", LegacyStorage.parse(dump("", mapOf("peloton-hud:rides" to "[]")), "old.example"))
        assertNull("storage threw", LegacyStorage.parse("null", "old.example"))
        assertNull(LegacyStorage.parse(null, "old.example"))
        assertNull("garbage", LegacyStorage.parse("{oops", "old.example"))
    }

    @Test
    fun anEmptyOldOriginIsADoneMoveNotAFailure() {
        assertEquals(emptyMap<String, String>(), LegacyStorage.parse(dump("old.example", emptyMap()), "old.example"))
    }

    @Test
    fun writeNeverOverwritesAndCarriesTheData() {
        val js = LegacyStorage.writeJs(mapOf("peloton-hud:settings" to """{"weightKg":80}"""))
        assertTrue(js.contains("localStorage.getItem(k)===null"))
        assertTrue(js.contains("peloton-hud:settings"))
    }
}
