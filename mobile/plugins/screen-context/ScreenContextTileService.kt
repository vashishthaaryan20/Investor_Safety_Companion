package __PACKAGE__.screencontext

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import __PACKAGE__.R

/** Quick Settings tile that checks whatever is currently on screen, with consent. */
class ScreenContextTileService : TileService() {

  override fun onStartListening() {
    super.onStartListening()
    val tile = qsTile ?: return
    tile.state = Tile.STATE_INACTIVE
    tile.label = getString(R.string.sc_tile_label)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      tile.subtitle = getString(R.string.sc_tile_subtitle)
    }
    tile.updateTile()
  }

  override fun onClick() {
    super.onClick()
    // SystemUI can replay a click that arrived while the panel was closed; ignore the duplicate.
    val now = SystemClock.elapsedRealtime()
    if (now - lastClickAt < CLICK_DEBOUNCE_MS) return
    lastClickAt = now

    val intent = Intent(this, ScreenCaptureActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (isLocked) {
      unlockAndRun { launch(intent) }
    } else {
      launch(intent)
    }
  }

  private fun launch(intent: Intent) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val pending = PendingIntent.getActivity(
        this,
        1,
        intent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
      startActivityAndCollapse(pending)
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }

  companion object {
    private const val CLICK_DEBOUNCE_MS = 1500L
    private var lastClickAt = 0L
  }
}
