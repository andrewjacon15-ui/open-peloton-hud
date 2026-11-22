package app.pelotonhud

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BleCyclingTest {
    private fun bytes(vararg v: Int) = ByteArray(v.size) { v[it].toByte() }

    @Test
    fun powerOnly() {
        // flags 0x0000, power 0x00FA = 250 W
        assertEquals(BleCycling.Power(250, null), BleCycling.parsePower(bytes(0x00, 0x00, 0xFA, 0x00)))
    }

    @Test
    fun powerWithBalanceAndCrankData() {
        // flags 0x0021 (balance + crank), power 300 W (0x012C), balance 0x64, crank revs 0x0102, event time 0x0400
        val p = BleCycling.parsePower(bytes(0x21, 0x00, 0x2C, 0x01, 0x64, 0x02, 0x01, 0x00, 0x04))
        assertEquals(BleCycling.Power(300, BleCycling.Crank(0x0102, 0x0400)), p)
    }

    @Test
    fun powerSkipsTorqueAndWheelFieldsBeforeCrank() {
        // flags 0x0034 (torque + wheel + crank): torque 2 bytes, wheel 6 bytes, then crank revs 5, time 1024
        val p = BleCycling.parsePower(bytes(0x34, 0x00, 0x64, 0x00, 1, 2, 1, 2, 3, 4, 5, 6, 0x05, 0x00, 0x00, 0x04))
        assertEquals(BleCycling.Power(100, BleCycling.Crank(5, 1024)), p)
    }

    @Test
    fun negativePowerReadsAsZeroAndShortPacketsAreRejected() {
        assertEquals(0, BleCycling.parsePower(bytes(0x00, 0x00, 0xFF, 0xFF))!!.watts)
        assertNull(BleCycling.parsePower(bytes(0x00, 0x00, 0x10)))
        assertNull("crank flag set but no crank bytes", BleCycling.parsePower(bytes(0x20, 0x00, 0x10, 0x00)))
    }

    @Test
    fun cscCrankWithAndWithoutWheelData() {
        assertEquals(BleCycling.Crank(10, 2048), BleCycling.parseCscCrank(bytes(0x02, 10, 0, 0x00, 0x08)))
        assertEquals(BleCycling.Crank(10, 2048), BleCycling.parseCscCrank(bytes(0x03, 1, 2, 3, 4, 5, 6, 10, 0, 0x00, 0x08)))
        assertNull("speed-only sensor", BleCycling.parseCscCrank(bytes(0x01, 1, 2, 3, 4, 5, 6)))
    }

    @Test
    fun cadenceFromCrankEventsIncludingWraparound() {
        val m = CadenceMeter()
        m.update(BleCycling.Crank(100, 0), now = 0)
        m.update(BleCycling.Crank(101, 683), now = 700) // one rev in 683/1024 s = ~90 rpm
        assertEquals(90, m.rpm)
        m.update(BleCycling.Crank(0xFFFF, 0xFF00), now = 1400)
        m.update(BleCycling.Crank(0x0000, 0xFF00 + 512 - 0x10000), now = 2000) // wraps both counters: 1 rev in 0.5 s = 120 rpm
        assertEquals(120, m.rpm)
    }

    @Test
    fun cadenceDropsToZeroWhenTheCranksStop() {
        val m = CadenceMeter(stopAfterMs = 3000)
        m.update(BleCycling.Crank(1, 0), now = 0)
        m.update(BleCycling.Crank(2, 1024), now = 1000)
        assertEquals(60, m.rpm)
        m.update(BleCycling.Crank(2, 1024), now = 2000) // same reading repeated: still coasting
        assertEquals(60, m.rpm)
        m.tick(now = 4500)
        assertEquals(0, m.rpm)
    }
}
