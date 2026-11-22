package app.pelotonhud

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Message
import android.os.Messenger
import android.util.Log

/**
 * Live power, cadence and resistance from `com.peloton.service.SensorData` (docs/SENSOR.md). Binds the service, registers metrics
 * 7/8/9 with our Messenger, keeps the latest valid reading of each (SensorAggregator), and calls `onSample` once a second with the
 * combined sample. Read-only: it only sends register messages, never anything that could drive the bike.
 */
class SensorSource(private val context: Context) : RideSensor {
    data class Sample(val power: Int, val cadence: Int, val resistance: Int)

    private val aggregator = SensorAggregator()
    private val main = Handler(Looper.getMainLooper())
    private var outgoing: Messenger? = null
    private var conn: ServiceConnection? = null
    private var onSample: ((Sample) -> Unit)? = null
    private var onStatus: ((Boolean) -> Unit)? = null
    private var emitting = false

    private val incoming = Messenger(Handler(Looper.getMainLooper()) { msg ->
        val value = readValue(msg)
        if (value != null) aggregator.update(msg.what, value)
        true
    })

    // The "data" value may be stored as Float or Double, so read it generically rather than with getFloat (which would return 0
    // for a Double). docs/SENSOR.md. Bundle.get is deprecated but is the only type-agnostic read.
    @Suppress("DEPRECATION")
    private fun readValue(msg: Message): Double? = (msg.data?.get("data") as? Number)?.toDouble()

    /** Bind and start streaming. `onStatus(true)` when the service is connected, `false` if it drops or never binds. */
    override val kind = "sensordata"

    override fun start(onSample: (Sample) -> Unit, onStatus: (Boolean) -> Unit) {
        this.onSample = onSample
        this.onStatus = onStatus
        val intent = Intent("android.intent.action.peloton.SensorData")
            .setPackage("com.peloton.service.SensorData")
            .addCategory("com.peloton.sensor.category.BIKE")
        conn = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName, binder: IBinder) {
                outgoing = Messenger(binder)
                // The service subscribes on a command code (not the metric id) and then streams metrics tagged 7/8/9. The exact
                // subscribe code is not known, so send the range the sniffer proved works; replies arrive tagged by metric. Spaced
                // out because sending them in one tight burst did not take. TODO: narrow to the exact subscribe code.
                for (code in SUBSCRIBE_CODES) main.postDelayed({ register(code) }, (code * 120L))
                onStatus(true)
                startEmitting()
            }
            override fun onServiceDisconnected(name: ComponentName) {
                outgoing = null
                onStatus(false)
            }
        }
        val bound = try {
            context.bindService(intent, conn!!, Context.BIND_AUTO_CREATE)
        } catch (e: SecurityException) {
            Log.w(TAG, "SensorData bind refused: ${e.message}")
            false
        }
        if (!bound) {
            Log.w(TAG, "SensorData did not bind")
            onStatus(false)
        }
    }

    private fun register(what: Int) {
        val m = Message.obtain(null, what)
        m.replyTo = incoming
        try {
            outgoing?.send(m)
        } catch (e: Exception) {
            Log.w(TAG, "register $what failed: ${e.message}")
        }
    }

    private fun startEmitting() {
        if (emitting) return
        emitting = true
        val tick = object : Runnable {
            override fun run() {
                onSample?.invoke(Sample(aggregator.power, aggregator.cadence, aggregator.resistance))
                if (emitting) main.postDelayed(this, 1000)
            }
        }
        main.post(tick)
    }

    override fun stop() {
        emitting = false
        main.removeCallbacksAndMessages(null)
        conn?.let { runCatching { context.unbindService(it) } }
        conn = null
        outgoing = null
    }

    companion object {
        const val TAG = "PelotonHud"
        // Command codes sent to subscribe. Replies come back tagged with metric ids 7/8/9 (SensorAggregator).
        private val SUBSCRIBE_CODES = 0..15
    }
}
