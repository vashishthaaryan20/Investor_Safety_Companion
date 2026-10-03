package __PACKAGE__.screencontext

import android.app.Activity
import android.content.Intent
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.view.WindowInsets

/**
 * Invisible activity started from the "Analyze screen" tile. It asks Android for one-time
 * screen-capture consent, hands the token to ScreenCaptureService, then opens the app with
 * the outcome. It stays transparent and in its own task during capture, so the app the
 * user was viewing is what ends up in the picture.
 */
class ScreenCaptureActivity : Activity() {
  private var handedOff = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (savedInstanceState != null) {
      handedOff = savedInstanceState.getBoolean(KEY_HANDED_OFF)
      if (handedOff) ScreenCaptureService.observe(::onOutcome)
      return
    }
    ScreenCaptureService.reset()

    val manager = getSystemService(MediaProjectionManager::class.java)
    if (manager == null) {
      onOutcome(mapOf("error" to "unsupported"))
      return
    }
    val consent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      // Whole-display only: the screen behind this activity is the one being checked.
      manager.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())
    } else {
      manager.createScreenCaptureIntent()
    }
    try {
      @Suppress("DEPRECATION")
      startActivityForResult(consent, REQUEST_CONSENT)
    } catch (e: Exception) {
      onOutcome(mapOf("error" to "unsupported"))
    }
  }

  override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)
    outState.putBoolean(KEY_HANDED_OFF, handedOff)
  }

  @Deprecated("Deprecated in Java")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    @Suppress("DEPRECATION")
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != REQUEST_CONSENT) return
    if (resultCode != RESULT_OK || data == null) {
      onOutcome(mapOf("error" to "denied"))
      return
    }

    handedOff = true
    ScreenCaptureService.observe(::onOutcome)
    val (barTop, barBottom) = systemBarSizes()
    val service = Intent(this, ScreenCaptureService::class.java)
      .putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, resultCode)
      .putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, data)
      .putExtra(ScreenCaptureService.EXTRA_CROP_TOP, barTop)
      .putExtra(ScreenCaptureService.EXTRA_CROP_BOTTOM, barBottom)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        startForegroundService(service)
      } else {
        startService(service)
      }
    } catch (e: Exception) {
      ScreenCaptureService.observe(null)
      onOutcome(mapOf("error" to "failed"))
    }
  }

  /**
   * Status and navigation bar heights in pixels. They are cropped from the capture: they show
   * notification icons and the clock, not the message being checked.
   */
  private fun systemBarSizes(): Pair<Int, Int> {
    val insets = window?.decorView?.rootWindowInsets ?: return 0 to 0
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val status = insets.getInsetsIgnoringVisibility(WindowInsets.Type.statusBars())
      val navigation = insets.getInsetsIgnoringVisibility(WindowInsets.Type.navigationBars())
      status.top to navigation.bottom
    } else {
      @Suppress("DEPRECATION")
      insets.stableInsetTop to insets.stableInsetBottom
    }
  }

  private fun onOutcome(outcome: Map<String, String>) {
    if (isFinishing) return
    ScreenContextStore.openApp(this, mapOf("source" to "tile") + outcome)
    finish()
    @Suppress("DEPRECATION")
    overridePendingTransition(0, 0)
  }

  override fun onDestroy() {
    ScreenCaptureService.observe(null)
    super.onDestroy()
  }

  companion object {
    private const val REQUEST_CONSENT = 4107
    private const val KEY_HANDED_OFF = "handedOff"
  }
}
