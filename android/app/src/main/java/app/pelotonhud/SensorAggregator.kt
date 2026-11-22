package app.pelotonhud

/**
 * Keeps the latest valid reading of each metric from SensorData and combines them into one sample. Pure (no Android), so it is
 * unit-tested on the JVM. Metric ids and the raw frame are documented in docs/SENSOR.md.
 *
 * Out-of-range values are dropped (the service occasionally emits a garbage frame), so a bad read never reaches the HUD; the last
 * good value is kept until a new valid one arrives.
 */
class SensorAggregator {
    var cadence = 0
        private set
    var power = 0
        private set
    var resistance = 0
        private set

    /** Apply one metric update (`what` + parsed value). Returns true if it was in range and applied. */
    fun update(what: Int, value: Double): Boolean {
        if (!value.isFinite()) return false
        return when (what) {
            CADENCE -> accept(value, 0.0, 200.0) { cadence = it }
            POWER -> accept(value, 0.0, 2000.0) { power = it }
            RESISTANCE -> accept(value, 0.0, 100.0) { resistance = it }
            else -> false
        }
    }

    private inline fun accept(value: Double, lo: Double, hi: Double, set: (Int) -> Unit): Boolean {
        if (value < lo || value > hi) return false
        set(Math.round(value).toInt())
        return true
    }

    companion object {
        const val CADENCE = 7
        const val POWER = 8
        const val RESISTANCE = 9
        val METRIC_IDS = intArrayOf(CADENCE, POWER, RESISTANCE)
    }
}
