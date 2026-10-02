package __PACKAGE__.screencontext

import android.app.Activity
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log

/**
 * Share-sheet target ("Check with SANGYAN Shield") for images and text. Copies the shared
 * content into the app's cache, re-encoding images as JPEG (which also drops EXIF data such
 * as location), and opens /screen-context. Nothing is uploaded until the user confirms.
 */
class ShareReceiverActivity : Activity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (savedInstanceState != null) return
    val shared = intent
    Thread {
      val outcome = receive(shared)
      runOnUiThread {
        ScreenContextStore.openApp(this, mapOf("source" to "share") + outcome)
        finish()
        @Suppress("DEPRECATION")
        overridePendingTransition(0, 0)
      }
    }.start()
  }

  private fun receive(intent: Intent?): Map<String, String> {
    if (intent?.action != Intent.ACTION_SEND) return mapOf("error" to "unsupported")
    val type = intent.type.orEmpty()
    return try {
      when {
        type.startsWith("image/") -> receiveImage(intent)
        type.startsWith("text/") -> receiveText(intent)
        else -> mapOf("error" to "unsupported")
      }
    } catch (e: Exception) {
      Log.w(TAG, "Could not read shared content: " + e.javaClass.simpleName)
      mapOf("error" to "failed")
    }
  }

  private fun receiveImage(intent: Intent): Map<String, String> {
    val uri = streamUri(intent) ?: return mapOf("error" to "unreadable")
    // file:// links or this app's own providers could expose SANGYAN's private files.
    if (uri.scheme != "content" || uri.authority.orEmpty().startsWith(packageName)) {
      return mapOf("error" to "unsupported")
    }

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return mapOf("error" to "unreadable")

    var sampleSize = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sampleSize * 2) >= MAX_IMAGE_DIMENSION) {
      sampleSize *= 2
    }
    val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
    val decoded = contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
      ?: return mapOf("error" to "unreadable")

    val bitmap = decoded.limitSize(MAX_IMAGE_DIMENSION)
    val (id, file) = ScreenContextStore.newFile(this, "jpg")
    bitmap.saveAsJpeg(file)
    if (bitmap !== decoded) bitmap.recycle()
    decoded.recycle()
    return mapOf("kind" to "image", "capture" to id)
  }

  private fun receiveText(intent: Intent): Map<String, String> {
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim().orEmpty()
    val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)?.trim().orEmpty()
    val combined = listOf(subject.takeIf { it.isNotEmpty() && !text.contains(it) }, text)
      .filterNot { it.isNullOrEmpty() }
      .joinToString("\n\n")
      .take(MAX_TEXT_LENGTH)
    if (combined.isBlank()) return mapOf("error" to "empty")

    val (id, file) = ScreenContextStore.newFile(this, "txt")
    file.writeText(combined, Charsets.UTF_8)
    return mapOf("kind" to "text", "capture" to id)
  }

  private fun streamUri(intent: Intent): Uri? {
    val extra = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(Intent.EXTRA_STREAM)
    }
    return extra ?: intent.clipData?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.uri
  }

  companion object {
    private const val TAG = "SangyanShare"
    private const val MAX_TEXT_LENGTH = 8000
  }
}
