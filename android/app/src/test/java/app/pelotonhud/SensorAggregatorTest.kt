package app.pelotonhud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SensorAggregatorTest {
    @Test
    fun keepsLatestOfEachMetric() {
        val a = SensorAggregator()
        assertTrue(a.update(SensorAggregator.CADENCE, 82.0))
        assertTrue(a.update(SensorAggregator.POWER, 155.0))
        assertTrue(a.update(SensorAggregator.RESISTANCE, 41.0))
        assertEquals(82, a.cadence)
        assertEquals(155, a.power)
        assertEquals(41, a.resistance)
        a.update(SensorAggregator.CADENCE, 90.0)
        assertEquals(90, a.cadence)
        assertEquals(155, a.power) // unchanged
    }

    @Test
    fun dropsOutOfRangeFramesAndKeepsLastGood() {
        val a = SensorAggregator()
        a.update(SensorAggregator.RESISTANCE, 50.0)
        assertFalse("830 is garbage", a.update(SensorAggregator.RESISTANCE, 830.0))
        assertEquals(50, a.resistance)
        assertFalse(a.update(SensorAggregator.CADENCE, -5.0))
        assertFalse(a.update(SensorAggregator.POWER, Double.NaN))
        assertFalse("unknown metric id", a.update(3, 100.0))
    }

    @Test
    fun roundsToWholeUnits() {
        val a = SensorAggregator()
        a.update(SensorAggregator.POWER, 259.6)
        assertEquals(260, a.power)
    }
}
