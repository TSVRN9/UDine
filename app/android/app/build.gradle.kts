import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services") // reads google-services.json (both packages: one file serves both flavors)
}

// Each flavor signs with its key outside the repo: internal (app/tool/build-internal-android.sh) and store, Play's upload key
// (app/tool/build-store-android.sh); without one, that flavor keeps Flutter's debug key.
fun keyProps(name: String) = file("${System.getProperty("user.home")}/.config/udine/$name").takeIf { it.exists() }
    ?.let { f -> Properties().apply { f.inputStream().use { load(it) } } }
val keys = mapOf("internal" to keyProps("key.properties"), "store" to keyProps("store-key.properties"))

android {
    namespace = "com.udinetogether.udine"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        isCoreLibraryDesugaringEnabled = true // flutter_local_notifications 10+
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.udinetogether.udine"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion   // 24, as RN shipped; Health Connect's client library needs 26 (manifest overrideLibrary, calls guarded in MainActivity)
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        for ((name, key) in keys) if (key != null) create(name) {
            storeFile = file(key.getProperty("storeFile"))
            storePassword = key.getProperty("storePassword")
            keyAlias = key.getProperty("keyAlias")
            keyPassword = key.getProperty("keyPassword")
        }
    }

    buildFeatures { resValues = true }   // AGP 8+ disables resValue() by default; the flavors' app_name needs it

    flavorDimensions += "channel"
    productFlavors {
        create("store") {
            dimension = "channel"
            resValue("string", "app_name", "UDine")
        }
        create("internal") {
            dimension = "channel"
            applicationIdSuffix = ".internal"
            resValue("string", "app_name", "UDine (internal)")
        }
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

// A build type's signing config outranks a flavor's, and Flutter's profile type inherits debug's: set it on each flavor's variants instead.
androidComponents {
    for ((name, key) in keys) onVariants(selector().withFlavor("channel" to name)) { v ->
        if (key != null) v.signingConfig.setConfig(android.signingConfigs.getByName(name))
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
    implementation("androidx.health.connect:connect-client:1.1.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
