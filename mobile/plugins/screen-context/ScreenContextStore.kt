package __PACKAGE__.screencontext

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.media.Image
import android.net.Uri
import java.io.File
import java.util.UUID

/**
 * Temporary hand-off between native capture/share code and the React Native
 * /screen-context screen. Only a random id travels in the deep link; React Native
 * resolves it inside this app's cache folder, so other apps can't point it at files.
 */
object ScreenContextStore {
  private const val DIRECTORY = "screen-context"
  private const val SCHEME = "__SCHEME__"
  private val CAPTURE_ID = Regex("^[a-f0-9]{32}$")

  /** Only the newest capture is ever needed; older ones may hold sensitive content. */
  fun newFile(context: Context, extension: String): Pair<String, File> {
    val directory = File(context.cacheDir, DIRECTORY)
    directory.listFiles()?.forEach { it.delete() }
    directory.mkdirs()
    val id = UUID.randomUUID().toString().replace("-", "")
    return id to File(directory, "$id.$extension")
  }

  /** A capture written by newFile, or null if the id is malformed or the file is gone. */
  fun existingFile(context: Context, id: String, extension: String): File? {
    if (!CAPTURE_ID.matches(id)) return null
    val file = File(File(context.cacheDir, DIRECTORY), "$id.$extension")
    return file.takeIf { it.isFile }
  }

  fun clear(context: Context) {
    File(context.cacheDir, DIRECTORY).listFiles()?.forEach { it.delete() }
  }

  fun openApp(context: Context, params: Map<String, String>) {
    val builder = Uri.Builder().scheme(SCHEME).authority("screen-context")
    params.forEach { (key, value) -> builder.appendQueryParameter(key, value) }
    val intent = Intent(Intent.ACTION_VIEW, builder.build()).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    context.startActivity(intent)
  }
}

internal const val MAX_IMAGE_DIMENSION = 2560
internal const val JPEG_QUALITY = 90

internal fun Image.toBitmap(width: Int, height: Int): Bitmap {
  val plane = planes[0]
  val pixelStride = plane.pixelStride
  val rowPadding = plane.rowStride - pixelStride * width
  val padded = Bitmap.createBitmap(width + rowPadding / pixelStride, height, Bitmap.Config.ARGB_8888)
  padded.copyPixelsFromBuffer(plane.buffer)
  if (padded.width == width) return padded
  val cropped = Bitmap.createBitmap(padded, 0, 0, width, height)
  padded.recycle()
  return cropped
}

/**
 * Screens marked secure (banking, payments, video) are captured as black. A sparse grid
 * is enough to tell; a few lit samples are allowed for the status bar drawn on top.
 */
internal fun Bitmap.isMostlyBlack(): Boolean {
  val columns = 24
  val rows = 48
  var lit = 0
  for (row in 0 until rows) {
    for (column in 0 until columns) {
      val pixel = getPixel((width - 1) * column / (columns - 1), (height - 1) * row / (rows - 1))
      if (Color.red(pixel) > 12 || Color.green(pixel) > 12 || Color.blue(pixel) > 12) lit++
    }
  }
  return lit * 1000 < columns * rows * 15
}

/** Drops rows from the top and bottom (system bars); ignores values that would leave too little. */
internal fun Bitmap.cropRows(top: Int, bottom: Int): Bitmap {
  val cropTop = top.coerceAtLeast(0)
  val cropBottom = bottom.coerceAtLeast(0)
  if (cropTop + cropBottom == 0 || cropTop + cropBottom >= height / 2) return this
  return Bitmap.createBitmap(this, 0, cropTop, width, height - cropTop - cropBottom)
}

internal fun Bitmap.limitSize(maxDimension: Int): Bitmap {
  val longest = maxOf(width, height)
  if (longest <= maxDimension) return this
  val scale = maxDimension.toFloat() / longest
  return Bitmap.createScaledBitmap(this, (width * scale).toInt(), (height * scale).toInt(), true)
}

internal fun Bitmap.saveAsJpeg(file: File) {
  file.outputStream().use { compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it) }
}
