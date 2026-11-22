package app.pelotonhud

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class MessagesTest {
    @Test
    fun sampleMatchesTheContract() {
        val o = JSONObject(Messages.sample(1000L, 150, 82, 40))
        assertEquals("sample", o.getString("type"))
        assertEquals(150, o.getInt("power"))
        assertEquals(82, o.getInt("cadence"))
        assertEquals(40, o.getInt("resistance"))
        assertFalse("hr is left out when unknown", o.has("hr"))
        assertEquals(140, JSONObject(Messages.sample(1000L, 150, 82, 40, hr = 140)).getInt("hr"))
    }

    @Test
    fun helloAndRide() {
        val hello = JSONObject(Messages.hello("0.1.0", "PLTN-RB1VQ", "affernet"))
        assertEquals("affernet", hello.getString("sensor"))
        val ride = JSONObject(Messages.ride("20261102-180000-abcd", "active", startedAt = 5L))
        assertEquals("active", ride.getString("state"))
        assertEquals(5L, ride.getLong("startedAt"))
    }

    @Test
    fun overlayNavAndRideStartStop() {
        // Back vs Home both close the overlay but tell the web where to land; the ride keeps running either way.
        assertEquals("select", JSONObject(Messages.overlayClosed("select")).getString("nav"))
        assertEquals("home", JSONObject(Messages.overlayClosed()).getString("nav"))
        assertEquals("rideStarted", JSONObject(Messages.rideStarted()).getString("type"))
        assertEquals("rideEnded", JSONObject(Messages.rideEnded()).getString("type"))
    }

    @Test
    fun appsListsInstalledPackages() {
        val o = JSONObject(Messages.apps(listOf("com.netflix.mediaclient", "com.amazon.kindle")))
        assertEquals("apps", o.getString("type"))
        val arr = o.getJSONArray("installed")
        assertEquals(2, arr.length())
        assertEquals("com.netflix.mediaclient", arr.getString(0))
    }

    @Test
    fun sensorsMatchesTheContract() {
        val o = JSONObject(Messages.sensors("internal", "Bike's built-in sensor", true, listOf(BleScanner.Found("AA:BB", "Pedals", "power"))))
        assertEquals("sensors", o.getString("type"))
        assertEquals("internal", o.getString("current"))
        assertEquals(true, o.getBoolean("scanning"))
        val d = o.getJSONArray("devices").getJSONObject(0)
        assertEquals("AA:BB", d.getString("id"))
        assertEquals("power", d.getString("kind"))
        assertFalse("error is left out when there is none", o.has("error"))
    }
}
