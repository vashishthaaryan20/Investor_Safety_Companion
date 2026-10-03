package com.ashhhh69.mobile

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.*
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.Toast
import java.io.File
import java.io.FileOutputStream

private const val APP_SCHEME = "mobile"   // <- change if your manifest shows a different scheme

class SelectionActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val path = intent.getStringExtra("path")
        val bmp = path?.let { BitmapFactory.decodeFile(it) }
        if (bmp == null) { finish(); return }

        val selection = SelectionView(this, bmp)
        val root = FrameLayout(this)
        root.addView(selection, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        val bar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val cancel = Button(this).apply { text = "Cancel"; setOnClickListener { finish() } }
        val send = Button(this).apply {
            text = "Check this"
            setOnClickListener {
                val crop = selection.cropOrNull()
                if (crop == null) {
                    Toast.makeText(this@SelectionActivity,
                        "Drag a box over the message first", Toast.LENGTH_SHORT).show()
                } else {
                    sendToApp(crop)
                }
            }
        }
        bar.addView(cancel)
        bar.addView(send)
        val lp = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL)
        lp.bottomMargin = (72 * resources.displayMetrics.density).toInt()
        root.addView(bar, lp)
        setContentView(root)
    }

    private fun sendToApp(crop: Bitmap) {
        val file = File(cacheDir, "crop_${System.currentTimeMillis()}.jpg")
        FileOutputStream(file).use { crop.compress(Bitmap.CompressFormat.JPEG, 95, it) }
        val link = Uri.parse("$APP_SCHEME://scam-check").buildUpon()
            .appendQueryParameter("uri", Uri.fromFile(file).toString())
            .build()
        val open = Intent(Intent.ACTION_VIEW, link).apply {
            setPackage(packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(open)
        finish()
    }
}

class SelectionView(context: Context, private val bmp: Bitmap) : View(context) {

    private val dst = RectF()
    private var sx = 0f; private var sy = 0f
    private var ex = 0f; private var ey = 0f
    private var hasSel = false

    private val dim = Paint().apply { color = 0x99000000.toInt() }
    private val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE; style = Paint.Style.STROKE; strokeWidth = 5f
    }
    private val hint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE; textSize = 52f; textAlign = Paint.Align.CENTER
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        val scale = minOf(w.toFloat() / bmp.width, h.toFloat() / bmp.height)
        val dw = bmp.width * scale
        val dh = bmp.height * scale
        dst.set((w - dw) / 2, (h - dh) / 2, (w + dw) / 2, (h + dh) / 2)
    }

    private fun selRect() = RectF(minOf(sx, ex), minOf(sy, ey), maxOf(sx, ex), maxOf(sy, ey))

    override fun onDraw(c: Canvas) {
        c.drawColor(Color.BLACK)
        c.drawBitmap(bmp, null, dst, null)
        val w = width.toFloat(); val h = height.toFloat()
        if (hasSel) {
            val r = selRect()
            c.drawRect(0f, 0f, w, r.top, dim)
            c.drawRect(0f, r.bottom, w, h, dim)
            c.drawRect(0f, r.top, r.left, r.bottom, dim)
            c.drawRect(r.right, r.top, w, r.bottom, dim)
            c.drawRect(r, border)
        } else {
            c.drawRect(0f, 0f, w, h, dim)
            c.drawText("Drag to select the message", w / 2, h / 2, hint)
        }
    }

    override fun onTouchEvent(e: MotionEvent): Boolean {
        val x = e.x.coerceIn(dst.left, dst.right)
        val y = e.y.coerceIn(dst.top, dst.bottom)
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> { sx = x; sy = y; ex = x; ey = y; hasSel = true }
            MotionEvent.ACTION_MOVE, MotionEvent.ACTION_UP -> { ex = x; ey = y }
        }
        invalidate()
        return true
    }

    fun cropOrNull(): Bitmap? {
        if (!hasSel) return null
        val r = selRect()
        if (r.width() < 40 || r.height() < 40) return null
        val scale = bmp.width / dst.width()
        val left = ((r.left - dst.left) * scale).toInt().coerceIn(0, bmp.width - 1)
        val top = ((r.top - dst.top) * scale).toInt().coerceIn(0, bmp.height - 1)
        val cw = (r.width() * scale).toInt().coerceAtMost(bmp.width - left)
        val ch = (r.height() * scale).toInt().coerceAtMost(bmp.height - top)
        return Bitmap.createBitmap(bmp, left, top, cw, ch)
    }
}