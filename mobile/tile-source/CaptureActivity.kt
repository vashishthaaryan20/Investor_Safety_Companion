package com.ashhhh69.mobile

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.widget.Toast
import androidx.core.content.ContextCompat

object CaptureBridge {
    var onResult: ((String?) -> Unit)? = null
}

class CaptureActivity : Activity() {

    private val requestCode = 4001

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(mpm.createScreenCaptureIntent(), requestCode)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(req: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(req, resultCode, data)
        if (req == requestCode && resultCode == RESULT_OK && data != null) {
            CaptureBridge.onResult = { path ->
                if (path != null) {
                    startActivity(Intent(this, SelectionActivity::class.java).putExtra("path", path))
                } else {
                    Toast.makeText(this, "Could not capture the screen", Toast.LENGTH_LONG).show()
                }
                finish()
            }
            val svc = Intent(this, CaptureService::class.java)
                .putExtra("resultCode", resultCode)
                .putExtra("data", data)
            ContextCompat.startForegroundService(this, svc)
        } else {
            finish()
        }
    }

    override fun onDestroy() {
        CaptureBridge.onResult = null
        super.onDestroy()
    }
}