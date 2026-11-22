package app.pelotonhud

/**
 * Decides whether the kiosk guard should pull the HUD back to the front. We reclaim only when one of Peloton's own apps has come to the
 * foreground (its launcher, or anything else it pops up) — never for Netflix (we launch that on purpose and draw our stats over it), our own
 * app, or the system UI — and never while the rider has asked for Peloton on purpose (`standDown`, set by "Open Peloton app" and cleared when
 * the HUD comes back). Pure so it can be unit-tested; GuardService feeds it the most recent foreground package.
 */
object FocusPolicy {
    // Peloton ships its UI under both of these. Match the bare id and anything beneath it (e.g. com.peloton.launcher).
    private val PELOTON_PREFIXES = listOf("com.peloton", "com.onepeloton")

    fun isPeloton(pkg: String?): Boolean =
        !pkg.isNullOrEmpty() && PELOTON_PREFIXES.any { pkg == it || pkg.startsWith("$it.") }

    fun shouldReclaim(foreground: String?, self: String, standDown: Boolean = false): Boolean {
        if (standDown || foreground.isNullOrEmpty() || foreground == self) return false
        return isPeloton(foreground)
    }
}
