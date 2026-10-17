import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// The internal flavor signs with the key outside the repo (app/tool/build-internal-android.sh); without it, it keeps Flutter's debug key.
val internalKey = file("${System.getProperty("user.home")}/.config/udine/key.properties").takeIf { it.exists() }
    ?.let { f -> Properties().apply { f.inputStream().use { load(it) } } }

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
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (internalKey != null) create("internal") {
            storeFile = file(internalKey.getProperty("storeFile"))
            storePassword = internalKey.getProperty("storePassword")
            keyAlias = internalKey.getProperty("keyAlias")
            keyPassword = internalKey.getProperty("keyPassword")
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

// A build type's signing config outranks a flavor's, and Flutter's profile type inherits debug's: set it on the internal variants instead.
androidComponents {
    onVariants(selector().withFlavor("channel" to "internal")) { v ->
        if (internalKey != null) v.signingConfig.setConfig(android.signingConfigs.getByName("internal"))
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
