package __PACKAGE__.screencontext

import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.util.TypedValue
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Toast
import android.window.OnBackInvokedDispatcher
import __PACKAGE__.R

/**
 * Shown after the "Analyze screen" tile captures a frame. The user drags a box around the
 * message to check, or keeps the whole screen; only that part is handed to the app.
 * Leaving without choosing deletes the capture.
 */
class ScreenSelectionActivity : Activity() {
  private var captureId: String? = null
  private var selection: SelectionView? = null
  private var handedOff = false
  private var lastBackAt = 0L

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val id = intent.getStringExtra(EXTRA_CAPTURE)
    val file = id?.let { ScreenContextStore.existingFile(this, it, "jpg") }
    val image = file?.let { runCatching { BitmapFactory.decodeFile(it.path) }.getOrNull() }
    if (id == null || image == null) {
      openApp(mapOf("error" to "missing"))
      return
    }
    captureId = id

    val view = SelectionView(this, image, getString(R.string.sc_select_hint))
    selection = view
    val bar = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      setBackgroundColor(Color.BLACK)
      val pad = dp(12)
      setPadding(pad, pad, pad, pad)
      addView(button(R.string.sc_select_cancel) { finish() })
      addView(button(R.string.sc_select_whole) { openApp(mapOf("kind" to "image", "capture" to id)) })
      addView(button(R.string.sc_select_check) { checkSelection() })
    }
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.BLACK)
      addView(view, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
      addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
      // Targets that draw edge to edge would otherwise put the buttons under the navigation bar.
      setOnApplyWindowInsetsListener { v, insets ->
        @Suppress("DEPRECATION")
        v.setPadding(0, insets.systemWindowInsetTop, 0, insets.systemWindowInsetBottom)
        insets
      }
    }
    setContentView(root)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {
        confirmBack()
      }
    }
  }

  @Deprecated("Android 13+ uses the OnBackInvokedDispatcher callback registered in onCreate")
  override fun onBackPressed() {
    confirmBack()
  }

  // A drag that starts at the screen edge can still fire the system Back gesture, so one Back
  // must not throw the capture away.
  private fun confirmBack() {
    val now = SystemClock.uptimeMillis()
    if (now - lastBackAt < BACK_CONFIRM_MS) {
      finish()
      return
    }
    lastBackAt = now
    Toast.makeText(this, R.string.sc_select_back_again, Toast.LENGTH_SHORT).show()
  }

  // MATCH_PARENT height keeps all three buttons the same size when a label wraps to two lines.
  private fun button(label: Int, onClick: () -> Unit) = Button(this).apply {
    setText(label)
    isAllCaps = false
    maxLines = 2
    setOnClickListener { onClick() }
    layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f).apply {
      marginStart = dp(4)
      marginEnd = dp(4)
    }
  }

  private fun checkSelection() {
    val crop = selection?.cropOrNull()
    if (crop == null) {
      Toast.makeText(this, R.string.sc_select_too_small, Toast.LENGTH_SHORT).show()
      return
    }
    val outcome = try {
      val (id, file) = ScreenContextStore.newFile(this, "jpg")
      crop.saveAsJpeg(file)
      mapOf("kind" to "image", "capture" to id, "area" to "selected")
    } catch (e: Exception) {
      Log.w(TAG, "Could not save the selected area: " + e.javaClass.simpleName)
      mapOf("error" to "failed")
    } finally {
      crop.recycle()
    }
    openApp(outcome)
  }

  private fun openApp(outcome: Map<String, String>) {
    handedOff = true
    ScreenContextStore.openApp(this, mapOf("source" to "tile") + outcome)
    finish()
  }

  override fun onDestroy() {
    if (isFinishing && !handedOff && captureId != null) ScreenContextStore.clear(this)
    super.onDestroy()
  }

  private fun dp(value: Int) =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics).toInt()

  companion object {
    const val EXTRA_CAPTURE = "capture"
    private const val TAG = "SangyanScreenSelect"
    private const val BACK_CONFIRM_MS = 2500L
  }
}

/** The captured screen, fitted to the view, with a draggable selection box. */
private class SelectionView(context: Context, private val bitmap: Bitmap, private val hint: String) : View(context) {
  private val imageRect = RectF()
  private var startX = 0f
  private var startY = 0f
  private var endX = 0f
  private var endY = 0f
  private var hasSelection = false
  private val density = resources.displayMetrics.density

  private val dim = Paint().apply { color = 0x99000000.toInt() }
  private val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.WHITE
    style = Paint.Style.STROKE
    strokeWidth = 2 * density
  }
  private val hintPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.WHITE
    textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, 18f, resources.displayMetrics)
    textAlign = Paint.Align.CENTER
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    // A drag that starts at the screen edge is taken by the system Back gesture and closes this
    // screen, so the image stays clear of the edges and the edges opt out where Android allows.
    val edge = EDGE_INSET_DP * density
    val scale = minOf((w - 2 * edge) / bitmap.width, h.toFloat() / bitmap.height)
    val drawnWidth = bitmap.width * scale
    val drawnHeight = bitmap.height * scale
    imageRect.set((w - drawnWidth) / 2, (h - drawnHeight) / 2, (w + drawnWidth) / 2, (h + drawnHeight) / 2)
    hasSelection = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      systemGestureExclusionRects = listOf(Rect(0, 0, edge.toInt(), h), Rect(w - edge.toInt(), 0, w, h))
    }
  }

  private fun selectionRect() =
    RectF(minOf(startX, endX), minOf(startY, endY), maxOf(startX, endX), maxOf(startY, endY))

  override fun onDraw(canvas: Canvas) {
    canvas.drawBitmap(bitmap, null, imageRect, null)
    val w = width.toFloat()
    val h = height.toFloat()
    if (hasSelection) {
      val r = selectionRect()
      canvas.drawRect(0f, 0f, w, r.top, dim)
      canvas.drawRect(0f, r.bottom, w, h, dim)
      canvas.drawRect(0f, r.top, r.left, r.bottom, dim)
      canvas.drawRect(r.right, r.top, w, r.bottom, dim)
      canvas.drawRect(r, border)
    } else {
      canvas.drawRect(0f, 0f, w, h, dim)
      canvas.drawText(hint, w / 2, h / 2, hintPaint)
    }
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    val x = event.x.coerceIn(imageRect.left, imageRect.right)
    val y = event.y.coerceIn(imageRect.top, imageRect.bottom)
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        startX = x
        startY = y
        endX = x
        endY = y
        hasSelection = true
      }
      MotionEvent.ACTION_MOVE, MotionEvent.ACTION_UP -> {
        endX = x
        endY = y
      }
    }
    invalidate()
    return true
  }

  /** The selected part at full capture resolution, or null if nothing usable is selected. */
  fun cropOrNull(): Bitmap? {
    if (!hasSelection) return null
    val r = selectionRect()
    val minSide = MIN_SELECTION_DP * density
    if (r.width() < minSide || r.height() < minSide) return null
    val scale = bitmap.width / imageRect.width()
    val left = ((r.left - imageRect.left) * scale).toInt().coerceIn(0, bitmap.width - 1)
    val top = ((r.top - imageRect.top) * scale).toInt().coerceIn(0, bitmap.height - 1)
    val cropWidth = (r.width() * scale).toInt().coerceIn(1, bitmap.width - left)
    val cropHeight = (r.height() * scale).toInt().coerceIn(1, bitmap.height - top)
    return Bitmap.createBitmap(bitmap, left, top, cropWidth, cropHeight)
  }

  companion object {
    private const val MIN_SELECTION_DP = 32
    private const val EDGE_INSET_DP = 32
  }
}
