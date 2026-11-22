package app.pelotonhud

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.Message
import android.os.Messenger
import android.util.Log

/**
 * Spike S2: read live data from `com.peloton.service.SensorData`. That service binds as an `IMessenger` (phase 0), so this is the
 * no-AIDL path: wrap the binder in a Messenger, hand it our own Messenger in `replyTo`, and fire a burst of candidate "subscribe"
 * codes (`what` 0..15) — one of them should make it stream. Everything it sends back is logged in full under "PelotonHudSniff".
 *
 * Read-only: it never calls affernet (which can write to the bike) and sends only empty register messages to SensorData.
 * Run with `npm run bike -- sniff`, pedal and turn the resistance knob, and watch which numbers in the Bundle move.
 */
class SniffActivity : Activity() {
    private var outgoing: Messenger? = null
    private var conn: ServiceConnection? = null

    private val incoming = Messenger(Handler(Looper.getMainLooper()) { msg ->
        log("REPLY", msg)
        true
    })

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val intent = Intent("android.intent.action.peloton.SensorData")
            .setPackage("com.peloton.service.SensorData")
            .addCategory("com.peloton.sensor.category.BIKE")
        conn = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName, binder: IBinder) {
                val descriptor = runCatching { binder.interfaceDescriptor }.getOrNull()
                Log.w(TAG, "CONNECTED $name descriptor=$descriptor")
                outgoing = Messenger(binder)
                // Most Messenger services use MSG_REGISTER_CLIENT = 1; we don't know the code, so try a range, spaced out.
                val h = Handler(Looper.getMainLooper())
                for (what in 0..15) {
                    h.postDelayed({ register(what) }, (what * 150).toLong())
                }
            }
            override fun onServiceDisconnected(name: ComponentName) {
                Log.w(TAG, "DISCONNECTED")
            }
        }
        val ok = try {
            bindService(intent, conn!!, Context.BIND_AUTO_CREATE)
        } catch (e: SecurityException) {
            Log.w(TAG, "bindService REFUSED: ${e.message}")
            false
        }
        Log.w(TAG, "bindService SensorData -> $ok")
    }

    /** Send one register attempt: `what`, our Messenger in replyTo, so the service knows where to stream. */
    private fun register(what: Int) {
        val m = Message.obtain(null, what)
        m.replyTo = incoming
        try {
            outgoing?.send(m)
            Log.w(TAG, "SENT register what=$what")
        } catch (e: Exception) {
            Log.w(TAG, "SENT register what=$what FAILED: ${e.message}")
        }
    }

    private fun log(tag: String, msg: Message) {
        val b = msg.data
        val fields = b?.let { bundle ->
            bundle.keySet().joinToString(", ") { k -> "$k=${runCatching { bundle.get(k) }.getOrNull()}" }
        } ?: ""
        val obj = msg.obj?.let { "${it.javaClass.name}=$it" } ?: "null"
        Log.w(TAG, "$tag what=${msg.what} arg1=${msg.arg1} arg2=${msg.arg2} obj=$obj data={$fields}")
    }

    override fun onDestroy() {
        conn?.let { runCatching { unbindService(it) } }
        super.onDestroy()
    }

    companion object {
        const val TAG = "PelotonHudSniff"
    }
}
