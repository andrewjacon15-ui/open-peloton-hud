package app.pelotonhud

/**
 * Finds Peloton's own home screen on whatever build this is, so "Open Peloton app" works without hard-coding one package name. Given every
 * activity that answers the HOME intent (package + class), prefer a Peloton one, else any home that is not ours (e.g. a stock launcher on a
 * tablet). Pure; MainActivity supplies the list from the PackageManager.
 */
object PelotonApps {
    data class Home(val pkg: String, val cls: String)

    fun pickHome(homes: List<Home>, self: String): Home? {
        val others = homes.filter { it.pkg != self }
        return others.firstOrNull { FocusPolicy.isPeloton(it.pkg) } ?: others.firstOrNull()
    }

    /**
     * Packages that must be launched via a specific activity rather than their default launcher. Netflix's own launcher on this build
     * resolves to Peloton's membership-gated wrapper ("active Peloton subscription" prompt), so we jump straight to Netflix's internal
     * launch activity. Anything not listed is launched with the package's default launch intent.
     */
    val DIRECT_ACTIVITY: Map<String, String> = mapOf(
        "com.netflix.mediaclient" to "com.netflix.mediaclient.ui.launch.NetflixComLaunchActivity",
    )

    /** Of the candidate packages, those that are installed and launchable (per the supplied check). Pure; MainActivity passes PackageManager. */
    fun installed(candidates: List<String>, isLaunchable: (String) -> Boolean): List<String> = candidates.filter(isLaunchable)
}
