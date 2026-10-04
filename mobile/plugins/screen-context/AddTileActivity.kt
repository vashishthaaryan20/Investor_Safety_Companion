package __PACKAGE__.screencontext

import android.app.Activity
import android.app.StatusBarManager
import android.content.ComponentName
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Bundle
import __PACKAGE__.R

/**
 * Shows Android's "Add tile?" prompt for the Analyze screen tile (Android 13+). The prompt
 * must come from a foreground activity, so the app starts this transparent one for it.
 */
class AddTileActivity : Activity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (savedInstanceState != null || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      finish()
      return
    }
    val statusBar = getSystemService(StatusBarManager::class.java)
    if (statusBar == null) {
      finish()
      return
    }
    try {
      statusBar.requestAddTileService(
        ComponentName(this, ScreenContextTileService::class.java),
        getString(R.string.sc_tile_label),
        Icon.createWithResource(this, R.drawable.ic_sc_tile),
        mainExecutor
      ) { finish() }
    } catch (e: Exception) {
      finish()
    }
  }
}
