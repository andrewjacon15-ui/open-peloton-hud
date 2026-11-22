package app.pelotonhud

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import java.util.UUID

/** The two standard Bluetooth cycling services and their measurement characteristics (Bluetooth SIG assigned numbers). */
object BleIds {
    private fun sig(short: Int): UUID = UUID.fromString(String.format("0000%04x-0000-1000-8000-00805f9b34fb", short))
    val CYCLING_POWER: UUID = sig(0x1818)
    val CP_MEASUREMENT: UUID = sig(0x2A63)
    val CSC: UUID = sig(0x1816)
    val CSC_MEASUREMENT: UUID = sig(0x2A5B)
    val CCCD: UUID = sig(0x2902) // client characteristic configuration: write ENABLE_NOTIFICATION_VALUE to subscribe
}

/**
 * Finds nearby Bluetooth LE power meters and cadence sensors for Settings → Sensor. Scans for [durationMs], reporting each new device as it
 * appears. Needs Bluetooth on, the location permission (granted by the installer, or asked for by MainActivity), and on Android 11 the
 * device's Location setting on — Android hides BLE scan results otherwise.
 */
@SuppressLint("MissingPermission") // MainActivity checks the permission before scanning
class BleScanner(context: Context) {
    data class Found(val address: String, val name: String, val kind: String) // kind: "power" or "cadence"

    private val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?)?.adapter
    private val main = Handler(Looper.getMainLooper())
    private var callback: ScanCallback? = null

    val available: Boolean get() = adapter != null
    val enabled: Boolean get() = adapter?.isEnabled == true

    fun scan(durationMs: Long, onFound: (Found) -> Unit, onDone: () -> Unit) {
        stop()
        val scanner = adapter?.bluetoothLeScanner ?: return onDone()
        val seen = HashSet<String>()
        val cb = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val address = result.device.address ?: return
                if (!seen.add(address)) return
                val uuids = result.scanRecord?.serviceUuids.orEmpty().map { it.uuid }
                val kind = if (BleIds.CYCLING_POWER in uuids) "power" else "cadence"
                val name = result.scanRecord?.deviceName ?: result.device.name ?: "Unnamed sensor"
                onFound(Found(address, name, kind))
            }

            override fun onScanFailed(errorCode: Int) {
                Log.w(TAG, "BLE scan failed: $errorCode")
                onDone()
            }
        }
        callback = cb
        val filters = listOf(BleIds.CYCLING_POWER, BleIds.CSC).map { ScanFilter.Builder().setServiceUuid(ParcelUuid(it)).build() }
        scanner.startScan(filters, ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), cb)
        main.postDelayed({
            stop()
            onDone()
        }, durationMs)
    }

    fun stop() {
        main.removeCallbacksAndMessages(null)
        callback?.let { cb -> runCatching { adapter?.bluetoothLeScanner?.stopScan(cb) } }
        callback = null
    }

    private companion object {
        const val TAG = "PelotonHud"
    }
}

/**
 * Live power and cadence from a standard Bluetooth LE sensor, chosen in Settings → Sensor. Prefers the Cycling Power service (power, plus
 * cadence if the meter reports crank data); falls back to a Cycling Speed and Cadence sensor (cadence only). Resistance isn't part of
 * either standard, so it reads 0. Reconnects on its own if the sensor drops (e.g. it slept). Read-only: it only subscribes to notifications.
 */
@SuppressLint("MissingPermission") // MainActivity checks the permission before starting it
class BleSource(private val context: Context, private val address: String) : RideSensor {
    override val kind = "ble"

    private val adapter = (context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?)?.adapter
    private val main = Handler(Looper.getMainLooper())
    private val cadence = CadenceMeter()
    private var gatt: BluetoothGatt? = null
    private var power = 0
    private var lastPowerAt = 0L
    private var running = false
    private var onSample: ((SensorSource.Sample) -> Unit)? = null
    private var onStatus: ((Boolean) -> Unit)? = null
    // Descriptor writes must go one at a time; queue the subscriptions and write the next on each onDescriptorWrite.
    private val pending = ArrayDeque<BluetoothGattDescriptor>()

    private val tick = object : Runnable {
        override fun run() {
            val now = System.currentTimeMillis()
            cadence.tick(now)
            if (now - lastPowerAt > STALE_MS) power = 0 // a meter that stops notifying means the cranks stopped
            onSample?.invoke(SensorSource.Sample(power, cadence.rpm, 0))
            if (running) main.postDelayed(this, 1000)
        }
    }

    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
            main.post {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    g.discoverServices()
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    onStatus?.invoke(false)
                    g.close()
                    if (gatt === g) gatt = null
                    if (running) main.postDelayed({ connect() }, RECONNECT_MS)
                }
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            main.post {
                val cp = g.getService(BleIds.CYCLING_POWER)?.getCharacteristic(BleIds.CP_MEASUREMENT)
                val csc = g.getService(BleIds.CSC)?.getCharacteristic(BleIds.CSC_MEASUREMENT)
                pending.clear()
                for (c in listOfNotNull(cp, csc)) {
                    g.setCharacteristicNotification(c, true)
                    c.getDescriptor(BleIds.CCCD)?.let { d ->
                        d.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                        pending.add(d)
                    }
                }
                if (pending.isEmpty()) {
                    Log.w(TAG, "BLE device $address has no cycling power or cadence measurement")
                    onStatus?.invoke(false)
                    return@post
                }
                g.writeDescriptor(pending.removeFirst())
                onStatus?.invoke(true)
            }
        }

        override fun onDescriptorWrite(g: BluetoothGatt, d: BluetoothGattDescriptor, status: Int) {
            main.post { pending.removeFirstOrNull()?.let { g.writeDescriptor(it) } }
        }

        @Deprecated("Deprecated in API 33; this app targets API 30")
        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic) {
            val bytes = c.value ?: return
            val now = System.currentTimeMillis()
            main.post {
                when (c.uuid) {
                    BleIds.CP_MEASUREMENT -> BleCycling.parsePower(bytes)?.let { p ->
                        power = p.watts
                        lastPowerAt = now
                        p.crank?.let { cadence.update(it, now) }
                    }
                    BleIds.CSC_MEASUREMENT -> BleCycling.parseCscCrank(bytes)?.let { cadence.update(it, now) }
                }
            }
        }
    }

    override fun start(onSample: (SensorSource.Sample) -> Unit, onStatus: (Boolean) -> Unit) {
        this.onSample = onSample
        this.onStatus = onStatus
        running = true
        main.post(tick)
        connect()
    }

    private fun connect() {
        if (!running || gatt != null) return
        val device: BluetoothDevice = runCatching { adapter?.getRemoteDevice(address) }.getOrNull() ?: run {
            Log.w(TAG, "BLE: no adapter or bad address $address")
            onStatus?.invoke(false)
            return
        }
        gatt = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
    }

    override fun stop() {
        running = false
        main.removeCallbacksAndMessages(null)
        gatt?.let { runCatching { it.disconnect(); it.close() } }
        gatt = null
    }

    private companion object {
        const val TAG = "PelotonHud"
        const val STALE_MS = 3000L
        const val RECONNECT_MS = 3000L
    }
}
