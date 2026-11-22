package app.pelotonhud

/**
 * Parsers for the two standard Bluetooth LE cycling sensors (Bluetooth SIG GATT specs), so the HUD can use any off-the-shelf power meter or
 * cadence sensor when the bike's own sensor service can't be read (another Peloton build, another bike). Pure and unit-tested; BleSource
 * does the Android Bluetooth work and feeds the raw notification bytes here.
 *
 * - Cycling Power service 0x1818, measurement 0x2A63: flags (uint16), instantaneous power (sint16, W), then optional fields in flag order;
 *   crank revolution data (flag bit 5) gives cadence.
 * - Cycling Speed and Cadence service 0x1816, measurement 0x2A5B: flags (uint8), optional wheel data (bit 0), optional crank data (bit 1).
 *
 * All multi-byte fields are little-endian. Crank data is a cumulative revolution count (uint16) and the time of the last crank event in
 * 1/1024 s (uint16); both wrap, and cadence comes from the difference between two readings (CadenceMeter).
 */
object BleCycling {
    data class Crank(val revs: Int, val eventTime: Int)
    data class Power(val watts: Int, val crank: Crank?)

    private fun u8(b: ByteArray, i: Int) = b[i].toInt() and 0xFF
    private fun u16(b: ByteArray, i: Int) = u8(b, i) or (u8(b, i + 1) shl 8)
    private fun s16(b: ByteArray, i: Int) = u16(b, i).toShort().toInt()

    /** Cycling Power Measurement (0x2A63). Null if the packet is too short to hold what its flags promise. */
    fun parsePower(b: ByteArray): Power? {
        if (b.size < 4) return null
        val flags = u16(b, 0)
        val watts = s16(b, 2)
        var i = 4
        if (flags and 0x01 != 0) i += 1 // pedal power balance (uint8)
        if (flags and 0x04 != 0) i += 2 // accumulated torque (uint16)
        if (flags and 0x10 != 0) i += 6 // wheel revolution data (uint32 revs + uint16 time)
        var crank: Crank? = null
        if (flags and 0x20 != 0) {
            if (b.size < i + 4) return null
            crank = Crank(u16(b, i), u16(b, i + 2))
        }
        return Power(watts.coerceAtLeast(0), crank)
    }

    /** CSC Measurement (0x2A5B): the crank data, or null if the packet has none (a speed-only sensor) or is too short. */
    fun parseCscCrank(b: ByteArray): Crank? {
        if (b.isEmpty()) return null
        val flags = u8(b, 0)
        var i = 1
        if (flags and 0x01 != 0) i += 6 // wheel: uint32 revs + uint16 time
        if (flags and 0x02 == 0 || b.size < i + 4) return null
        return Crank(u16(b, i), u16(b, i + 2))
    }
}

/**
 * Turns successive crank readings into rpm. A sensor repeats the same reading when the cranks aren't turning, so a reading with no new
 * revolutions keeps the last cadence briefly, then drops to 0 after [stopAfterMs] without a new revolution.
 */
class CadenceMeter(private val stopAfterMs: Long = 3000) {
    private var last: BleCycling.Crank? = null
    private var lastChangeAt = 0L
    var rpm = 0
        private set

    fun update(c: BleCycling.Crank, now: Long) {
        val prev = last
        last = c
        if (prev == null) {
            lastChangeAt = now
            return
        }
        val dRevs = (c.revs - prev.revs) and 0xFFFF
        val dTime = (c.eventTime - prev.eventTime) and 0xFFFF // 1/1024 s
        if (dRevs == 0 || dTime == 0) {
            if (now - lastChangeAt > stopAfterMs) rpm = 0
            return
        }
        lastChangeAt = now
        val value = dRevs * 60.0 * 1024.0 / dTime
        rpm = if (value in 0.0..250.0) Math.round(value).toInt() else rpm // drop impossible jumps (e.g. after a sensor reset)
    }

    /** Call about once a second: zeroes the cadence if the sensor has gone quiet. */
    fun tick(now: Long) {
        if (last != null && now - lastChangeAt > stopAfterMs) rpm = 0
    }
}
