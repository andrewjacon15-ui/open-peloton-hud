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
import android.util.Log

/**
 * Spike S1: will Peloton's sensor services let a third-party app bind? Tries each candidate in turn, logs the result under the
 * "PelotonHudProbe" tag, then finishes. Logs are warnings because this Peloton build drops anything below (log.tag=W).
 * Run with `npm run bike -- probe`. It only binds and reads the interface name; it never calls into the service.
 *
 * Result on the Bike (PLTN-RB1VQ, 2026-11-02): IV1Interface, IAffernetService and SensorData (an IMessenger) bind; IBikeInterface
 * is the Bike+ ("TITAN") interface and returns null here.
 */
class ProbeActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private var current: ServiceConnection? = null
    private var index = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        next()
    }

    private fun next() {
        current?.let { runCatching { unbindService(it) } }
        current = null
        handler.removeCallbacksAndMessages(null)
        if (index >= CANDIDATES.size) {
            Log.w(TAG, "DONE")
            finish()
            return
        }
        probe(CANDIDATES[index++])
    }

    private fun probe(c: Candidate) {
        val intent = Intent(c.action).setPackage(c.pkg).apply { c.category?.let(::addCategory) }
        val conn = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName, binder: IBinder) {
                val descriptor = runCatching { binder.interfaceDescriptor }.getOrElse { "error: ${it.message}" }
                Log.w(TAG, "BOUND ${c.label}: $name descriptor=$descriptor alive=${binder.isBinderAlive}")
                handler.postDelayed(::next, 500)
            }
            override fun onServiceDisconnected(name: ComponentName) {
                Log.w(TAG, "DISCONNECTED ${c.label}")
            }
            override fun onBindingDied(name: ComponentName) {
                Log.w(TAG, "DIED ${c.label}")
            }
            override fun onNullBinding(name: ComponentName) {
                Log.w(TAG, "NULL BINDING ${c.label} (bound, but the service returned no interface)")
                handler.postDelayed(::next, 500)
            }
        }
        val ok = try {
            bindService(intent, conn, Context.BIND_AUTO_CREATE)
        } catch (e: SecurityException) {
            Log.e(TAG, "REFUSED ${c.label}: ${e.message}")
            false
        }
        if (!ok) {
            Log.e(TAG, "NOT BOUND ${c.label}")
            handler.post(::next)
            return
        }
        current = conn
        handler.postDelayed({
            Log.w(TAG, "TIMEOUT ${c.label}: no answer in ${TIMEOUT_MS} ms")
            next()
        }, TIMEOUT_MS)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        current?.let { runCatching { unbindService(it) } }
        super.onDestroy()
    }

    private data class Candidate(val label: String, val pkg: String, val action: String, val category: String? = null)

    companion object {
        const val TAG = "PelotonHudProbe"
        private const val TIMEOUT_MS = 4000L
        private const val AFFERNET = "com.onepeloton.affernetservice"
        private val CANDIDATES = listOf(
            // The original Bike is "V1" to affernet; IBikeInterface is the Bike+ ("TITAN") and is refused here.
            Candidate("affernet IV1Interface", AFFERNET, "$AFFERNET.IV1Interface"),
            Candidate("affernet IAffernetService", AFFERNET, "$AFFERNET.IAffernetService"),
            Candidate("affernet IBikeInterface", AFFERNET, "$AFFERNET.IBikeInterface"),
            Candidate("SensorData BIKE", "com.peloton.service.SensorData", "android.intent.action.peloton.SensorData", "com.peloton.sensor.category.BIKE"),
        )
    }
}
