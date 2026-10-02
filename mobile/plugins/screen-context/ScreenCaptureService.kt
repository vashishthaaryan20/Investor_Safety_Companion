package __PACKAGE__.screencontext

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.util.Log
import android.view.Display
import __PACKAGE__.R

/**
 * Captures exactly one frame of the screen with the user's MediaProjection consent, then
 * releases everything. Android 10+ requires a mediaProjection foreground service for this,
 * which is why it runs here rather than in the activity. Nothing is recorded continuously.
 */
class ScreenCaptureService : Service() {
  private lateinit var worker: HandlerThread
  private lateinit var handler: Handler
  private var projection: MediaProjection? = null
  private var virtualDisplay: VirtualDisplay? = null
  private var imageReader: ImageReader? = null
  private var started = false
  private var finished = false
  private var sawBlankFrame = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    worker = HandlerThread("sangyan-screen-capture").apply { start() }
    handler = Handler(worker.looper)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    try {
      startInForeground()
    } catch (e: Exception) {
      Log.w(TAG, "Could not start the capture service: " + e.javaClass.simpleName)
      handler.post { complete(mapOf("error" to "failed")) }
      return START_NOT_STICKY
    }
    if (started) return START_NOT_STICKY
    started = true

    val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
      ?: Activity.RESULT_CANCELED
    val data = intent?.let { resultData(it) }
    if (data == null) {
      handler.post { complete(mapOf("error" to "failed")) }
    } else {
      handler.post { begin(resultCode, data) }
    }
    return START_NOT_STICKY
  }

  private fun resultData(intent: Intent): Intent? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(EXTRA_RESULT_DATA)
    }

  private fun begin(resultCode: Int, data: Intent) {
    try {
      val manager = getSystemService(MediaProjectionManager::class.java)
      val mediaProjection = manager?.getMediaProjection(resultCode, data)
      if (mediaProjection == null) {
        complete(mapOf("error" to "failed"))
        return
      }
      projection = mediaProjection
      mediaProjection.registerCallback(object : MediaProjection.Callback() {
        override fun onStop() {
          complete(mapOf("error" to "stopped"))
        }
      }, handler)
      // Let the consent dialog finish disappearing so it isn't in the picture.
      handler.postDelayed({ startCapture() }, CAPTURE_DELAY_MS)
      handler.postDelayed({
        complete(mapOf("error" to if (sawBlankFrame) "blank" else "timeout"))
      }, CAPTURE_DELAY_MS + CAPTURE_TIMEOUT_MS)
    } catch (e: Exception) {
      Log.w(TAG, "Screen capture was not allowed: " + e.javaClass.simpleName)
      complete(mapOf("error" to "failed"))
    }
  }

  private fun startCapture() {
    val mediaProjection = projection ?: return
    if (finished) return
    try {
      val display = getSystemService(DisplayManager::class.java)?.getDisplay(Display.DEFAULT_DISPLAY)
      if (display == null) {
        complete(mapOf("error" to "failed"))
        return
      }
      val metrics = DisplayMetrics()
      @Suppress("DEPRECATION")
      display.getRealMetrics(metrics)
      val width = metrics.widthPixels
      val height = metrics.heightPixels

      val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
      imageReader = reader
      reader.setOnImageAvailableListener({ onFrame(it, width, height) }, handler)
      virtualDisplay = mediaProjection.createVirtualDisplay(
        "sangyan-screen-context",
        width,
        height,
        metrics.densityDpi,
        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
        reader.surface,
        null,
        handler
      )
    } catch (e: Exception) {
      Log.w(TAG, "Could not start screen capture: " + e.javaClass.simpleName)
      complete(mapOf("error" to "failed"))
    }
  }

  private fun onFrame(reader: ImageReader, width: Int, height: Int) {
    if (finished) return
    val image = try {
      reader.acquireLatestImage()
    } catch (e: Exception) {
      null
    } ?: return

    val bitmap = try {
      image.toBitmap(width, height)
    } catch (e: Exception) {
      null
    } finally {
      image.close()
    }
    if (bitmap == null) return

    if (bitmap.isMostlyBlack()) {
      // Wait for another frame; the timeout reports "blank" if none arrives.
      sawBlankFrame = true
      bitmap.recycle()
      return
    }

    val outcome = try {
      val scaled = bitmap.limitSize(MAX_IMAGE_DIMENSION)
      val (id, file) = ScreenContextStore.newFile(this, "jpg")
      scaled.saveAsJpeg(file)
      if (scaled !== bitmap) scaled.recycle()
      mapOf("kind" to "image", "capture" to id)
    } catch (e: Exception) {
      Log.w(TAG, "Could not save the captured screen: " + e.javaClass.simpleName)
      mapOf("error" to "failed")
    } finally {
      bitmap.recycle()
    }
    complete(outcome)
  }

  private fun complete(outcome: Map<String, String>) {
    if (finished) return
    finished = true
    handler.removeCallbacksAndMessages(null)
    runCatching { imageReader?.setOnImageAvailableListener(null, null) }
    runCatching { virtualDisplay?.release() }
    runCatching { imageReader?.close() }
    runCatching { projection?.stop() }
    virtualDisplay = null
    imageReader = null
    projection = null

    deliver(outcome)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  private fun startInForeground() {
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(NotificationManager::class.java)
      manager?.createNotificationChannel(
        NotificationChannel(
          CHANNEL_ID,
          getString(R.string.sc_channel_name),
          NotificationManager.IMPORTANCE_LOW
        )
      )
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    val notification = builder
      .setSmallIcon(R.drawable.ic_sc_tile)
      .setContentTitle(getString(R.string.sc_notification_title))
      .setContentText(getString(R.string.sc_notification_text))
      .setOngoing(true)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  override fun onDestroy() {
    worker.quitSafely()
    super.onDestroy()
  }

  companion object {
    const val EXTRA_RESULT_CODE = "resultCode"
    const val EXTRA_RESULT_DATA = "resultData"
    private const val TAG = "SangyanScreenCapture"
    private const val CHANNEL_ID = "screen_context"
    private const val NOTIFICATION_ID = 4108
    private const val CAPTURE_DELAY_MS = 700L
    private const val CAPTURE_TIMEOUT_MS = 2500L

    private val mainHandler = Handler(Looper.getMainLooper())
    private val lock = Any()
    private var listener: ((Map<String, String>) -> Unit)? = null
    private var pending: Map<String, String>? = null

    /** Drops any outcome left over from an earlier capture that nobody received. */
    fun reset() {
      synchronized(lock) { pending = null }
    }

    /** The activity may be recreated mid-capture; the outcome waits until it observes again. */
    fun observe(callback: ((Map<String, String>) -> Unit)?) {
      synchronized(lock) {
        listener = callback
        val outcome = pending
        if (callback != null && outcome != null) {
          pending = null
          mainHandler.post { callback(outcome) }
        }
      }
    }

    private fun deliver(outcome: Map<String, String>) {
      synchronized(lock) {
        val callback = listener
        if (callback != null) {
          mainHandler.post { callback(outcome) }
        } else {
          pending = outcome
        }
      }
    }
  }
}
