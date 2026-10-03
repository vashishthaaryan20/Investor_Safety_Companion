package com.ashhhh69.mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.Image
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import java.io.File
import java.io.FileOutputStream

class CaptureService : Service() {
    private var virtualDisplay: VirtualDisplay? = null

    private val handler = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForeground()
        val code = intent?.getIntExtra("resultCode", 0) ?: 0
        val data: Intent? = if (Build.VERSION.SDK_INT >= 33) {
            intent?.getParcelableExtra("data", Intent::class.java)
        } else {
            @Suppress("DEPRECATION") intent?.getParcelableExtra("data")
        }
        if (data == null) {
            finishWith(null)
            return START_NOT_STICKY
        }
        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val projection = mpm.getMediaProjection(code, data) ?: run {
            finishWith(null)
            return START_NOT_STICKY
        }
        projection.registerCallback(object : MediaProjection.Callback() {}, handler)
// wait so the permission box has disappeared from the screen
        handler.postDelayed({ capture(projection) }, 700)
        return START_NOT_STICKY
    }   // <-- closes onStartCommand



    private fun capture(projection: MediaProjection) {
        val (w, h) = screenSize()
        val dpi = resources.displayMetrics.densityDpi
        val reader = ImageReader.newInstance(w, h, PixelFormat.RGBA_8888, 2)
        virtualDisplay = projection.createVirtualDisplay(
            "scam-check", w, h, dpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            reader.surface, null, handler
        )
        handler.postDelayed({
            var path: String? = null
            try {
                val image = reader.acquireLatestImage()
                if (image != null) {
                    path = saveImage(image, w, h)
                    image.close()
                }
            } catch (e: Exception) {
                path = null
            }
            virtualDisplay?.release()
            virtualDisplay = null
            reader.close()
            projection.stop()
            finishWith(path)
        }, 600)
    }

    private fun saveImage(image: Image, w: Int, h: Int): String {
        val plane = image.planes[0]
        val rowPadding = plane.rowStride - plane.pixelStride * w
        val full = Bitmap.createBitmap(w + rowPadding / plane.pixelStride, h, Bitmap.Config.ARGB_8888)
        full.copyPixelsFromBuffer(plane.buffer)
        val bmp = Bitmap.createBitmap(full, 0, 0, w, h)
        val file = File(cacheDir, "capture.jpg")
        FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.JPEG, 95, it) }
        return file.absolutePath
    }

    private fun screenSize(): Pair<Int, Int> {
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        return if (Build.VERSION.SDK_INT >= 30) {
            val b = wm.maximumWindowMetrics.bounds
            Pair(b.width(), b.height())
        } else {
            val m = DisplayMetrics()
            @Suppress("DEPRECATION") wm.defaultDisplay.getRealMetrics(m)
            Pair(m.widthPixels, m.heightPixels)
        }
    }

    private fun finishWith(path: String?) {
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        CaptureBridge.onResult?.invoke(path)
    }

    private fun startAsForeground() {
        val channelId = "scam_check_capture"
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(channelId, "Scam Check capture", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val n = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Scam Check")
            .setContentText("Capturing the screen")
            .setSmallIcon(R.drawable.ic_tile)
            .build()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        } else {
            startForeground(1, n)
        }
    }
}