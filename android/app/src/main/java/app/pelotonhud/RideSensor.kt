package app.pelotonhud

/**
 * Where live power/cadence/resistance come from: the bike's own sensor service (SensorSource) or a standard Bluetooth LE power meter or
 * cadence sensor (BleSource). MainActivity picks one (Settings → Sensor) and treats them the same: `onSample` about once a second,
 * `onStatus(true/false)` as it connects or drops.
 */
interface RideSensor {
    /** Short id for the `hello`/`sensors` messages: "sensordata" or "ble". */
    val kind: String

    fun start(onSample: (SensorSource.Sample) -> Unit, onStatus: (Boolean) -> Unit = {})

    fun stop()
}
