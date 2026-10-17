package com.udinetogether.udine

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/** Where Health Connect's permission screen sends "privacy policy" (ACTION_SHOW_PERMISSIONS_RATIONALE, and VIEW_PERMISSION_USAGE through the alias): UDine's published policy, not the app. */
class PrivacyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_URL)))
        } catch (e: ActivityNotFoundException) {
            // no browser: nothing to show, and the permission screen stays where it was
        }
        finish()
    }

    companion object {
        const val PRIVACY_URL = "https://owenwang.dev/UDine/"
    }
}
