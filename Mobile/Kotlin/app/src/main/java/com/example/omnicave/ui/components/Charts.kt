package com.example.omnicave.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.example.omnicave.ui.theme.AppTheme

/** A plain line chart with a soft fill below the line and a dot on the latest value, as on the display. */
@Composable
fun LineChart(
    values: List<Double>,
    modifier: Modifier = Modifier,
    color: Color = AppTheme.colors.accent,
    /** An allowed range (low to high), drawn as a shaded band behind the line. */
    band: Pair<Double, Double>? = null,
) {
    Canvas(modifier) {
        if (values.size < 2) return@Canvas
        var low = values.min()
        var high = values.max()
        if (band != null) {
            low = minOf(low, band.first)
            high = maxOf(high, band.second)
        }
        if (high - low < 1e-6) {
            high += 1
            low -= 1
        }
        val pad = 4.dp.toPx()
        fun x(i: Int) = pad + i.toFloat() / (values.size - 1) * (size.width - 2 * pad)
        fun y(v: Double) = pad + (1 - ((v - low) / (high - low)).toFloat()) * (size.height - 2 * pad)

        if (band != null) {
            drawRect(Color.White, Offset(pad, y(band.second)), Size(size.width - 2 * pad, y(band.first) - y(band.second)), alpha = 0.06f)
        }
        val line = Path()
        values.forEachIndexed { i, v -> if (i == 0) line.moveTo(x(i), y(v)) else line.lineTo(x(i), y(v)) }
        val area = Path().apply {
            addPath(line)
            lineTo(x(values.lastIndex), size.height - pad)
            lineTo(x(0), size.height - pad)
            close()
        }
        drawPath(area, color, alpha = 0.12f)
        drawPath(line, color, style = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        drawCircle(color, radius = 3.dp.toPx(), center = Offset(x(values.lastIndex), y(values.last())))
    }
}
