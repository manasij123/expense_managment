package com.expensemanagement.alarm

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View
import java.util.Calendar
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/** A small self-drawn analog clock face — no extra dependency, just Canvas.
 * Redraws itself once a second. */
class AnalogClockView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    private val facePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        style = Paint.Style.FILL
    }
    private val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#6155F5")
        style = Paint.Style.STROKE
        strokeWidth = 10f
    }
    private val tickPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#6155F5")
        strokeWidth = 4f
    }
    private val hourHandPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#1E1B4B")
        strokeWidth = 14f
        strokeCap = Paint.Cap.ROUND
    }
    private val minuteHandPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#1E1B4B")
        strokeWidth = 9f
        strokeCap = Paint.Cap.ROUND
    }
    private val secondHandPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#34C759")
        strokeWidth = 4f
        strokeCap = Paint.Cap.ROUND
    }
    private val centerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#6155F5")
        style = Paint.Style.FILL
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)

        val cx = width / 2f
        val cy = height / 2f
        val radius = min(width, height) / 2f - 16f

        canvas.drawCircle(cx, cy, radius, facePaint)
        canvas.drawCircle(cx, cy, radius, rimPaint)

        for (i in 0 until 12) {
            val angle = Math.PI / 6 * i
            val startX = cx + (radius - 18f) * sin(angle).toFloat()
            val startY = cy - (radius - 18f) * cos(angle).toFloat()
            val endX = cx + radius * sin(angle).toFloat()
            val endY = cy - radius * cos(angle).toFloat()
            canvas.drawLine(startX, startY, endX, endY, tickPaint)
        }

        val calendar = Calendar.getInstance()
        val hour = calendar.get(Calendar.HOUR)
        val minute = calendar.get(Calendar.MINUTE)
        val second = calendar.get(Calendar.SECOND)

        val hourAngle = Math.PI / 6 * (hour + minute / 60f)
        val minuteAngle = Math.PI / 30 * (minute + second / 60f)
        val secondAngle = Math.PI / 30 * second

        drawHand(canvas, cx, cy, hourAngle, radius * 0.5f, hourHandPaint)
        drawHand(canvas, cx, cy, minuteAngle, radius * 0.75f, minuteHandPaint)
        drawHand(canvas, cx, cy, secondAngle, radius * 0.85f, secondHandPaint)

        canvas.drawCircle(cx, cy, 10f, centerPaint)

        postInvalidateDelayed(1000)
    }

    private fun drawHand(canvas: Canvas, cx: Float, cy: Float, angle: Double, length: Float, paint: Paint) {
        val endX = cx + length * sin(angle).toFloat()
        val endY = cy - length * cos(angle).toFloat()
        canvas.drawLine(cx, cy, endX, endY, paint)
    }
}
