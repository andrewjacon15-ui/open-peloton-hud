import java.util.Properties

plugins {
    id("com.android.application")
}

// Machine-local settings (android/local.properties is gitignored and never pushed). `hud.legacyOrigin` names an origin this bike's HUD used
// to be served from, so the first launch can carry its saved rides and settings over (LegacyStorage). Leave it out for a fresh install.
val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val legacyOrigin: String = localProps.getProperty("hud.legacyOrigin", "").trim().trimEnd('/')

android {
    namespace = "app.pelotonhud"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.pelotonhud"
        // The Peloton Bike runs Android 11.
        minSdk = 30
        targetSdk = 30
        // The Release workflow sets these from the tag and run number (each release must have a higher versionCode to install as an update).
        versionCode = System.getenv("HUD_VERSION_CODE")?.toIntOrNull() ?: 1
        versionName = System.getenv("HUD_VERSION_NAME")?.takeIf { it.isNotBlank() } ?: "0.1.0"
        // Where the WebView loads the web app from. Release serves the copy bundled in the APK (copyWebAssets) over WebViewAssetLoader, so the
        // HUD needs no internet to run (only the media apps do). Debug uses the laptop's dev server through `adb reverse`.
        buildConfigField("String", "WEB_URL", "\"https://appassets.androidplatform.net/index.html\"")
        buildConfigField("String", "LEGACY_ORIGIN", "\"$legacyOrigin\"")
    }

    // Release signing. Android only installs an update over an existing app if both are signed with the same key, so published releases must
    // always use one stable key: the Release workflow decodes it from repository secrets into HUD_KEYSTORE (see docs/RELEASING.md). A local
    // build without it falls back to this computer's debug key — fine for your own bike, but it can't update over a published release (or
    // the other way round) without uninstalling, which erases the saved rides.
    val releaseKeystore = System.getenv("HUD_KEYSTORE")?.takeIf { it.isNotBlank() && file(it).exists() }
    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = file(releaseKeystore)
                storePassword = System.getenv("HUD_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("HUD_KEY_ALIAS")
                keyPassword = System.getenv("HUD_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "WEB_URL", "\"http://localhost:5180/\"")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName(if (releaseKeystore != null) "release" else "debug")
        }
    }

    buildFeatures {
        buildConfig = true
        aidl = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        // We sideload onto one Peloton (Android 11 / API 30) and never publish to Play, so targetSdk stays 30 on purpose.
        disable += "ExpiredTargetSdkVersion"
    }
}

// Bundle the built web app (repo `dist/`) into the APK's assets; release builds serve it from appassets.androidplatform.net via
// WebViewAssetLoader (see MainActivity), so the HUD runs with no internet. `Sync` keeps it clean across builds; it only runs once
// `npm run build` has produced dist/, so a web-less debug build just skips it. The copied assets are gitignored.
tasks.register<Sync>("copyWebAssets") {
    val dist = rootProject.file("../dist")
    onlyIf { dist.exists() }
    from(dist)
    into(layout.projectDirectory.dir("src/main/assets"))
}
tasks.named("preBuild") { dependsOn("copyWebAssets") }

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250517")
}
