package com.example.omnicave.ui.cellar

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import com.example.omnicave.data.Bottle
import com.example.omnicave.data.Cellar
import com.example.omnicave.ui.components.Pill
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType
import com.example.omnicave.ui.theme.wineTint
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/** Bottle diameter and length in cm. */
private const val BD = 7.6f
private const val BL = 30f

/** A point: in cellar centimetres before projection; on screen (x, y) with its depth (z) after. */
private class V(val x: Float, val y: Float, val z: Float)

/** One inner wall of the cabinet: its colour, the direction it faces, and its four corners. */
private class Face(val color: Color, val n: V, vararg val corners: V)

private val PRESETS = listOf(Triple("Front", 0f, 0.05f), Triple("Angle", -0.55f, 0.32f), Triple("Side", -1.45f, 0.15f), Triple("Top", 0f, 1.3f))

private fun pathOf(points: List<Offset>) = Path().apply {
    points.forEachIndexed { i, p -> if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y) }
    close()
}

/**
 * The cellar in 3D, the same drawing as the display: a smoked-glass cabinet with glass bottles on its racks.
 * Drag to turn it, tap a bottle to open it. Left alone for ten seconds, it sways gently.
 */
@Composable
fun Cellar3D(cellar: Cellar, highlightId: Int?, onOpen: (Bottle) -> Unit, modifier: Modifier = Modifier) {
    val colors = AppTheme.colors
    // The display's cabinet is dark smoked glass (made for a black screen). On the light theme the same cabinet
    // is drawn in the palette's light tones, so it reads as an object on the page instead of dark patches.
    val dark = colors.isDark
    val wallBack = if (dark) Color(0xFF17181A) else colors.surfaceMuted
    val wallSide = if (dark) Color(0xFF101113) else lerp(colors.surfaceMuted, colors.hairline, 0.7f)
    val wallFloor = if (dark) Color(0xFF15171A) else colors.hairline
    val wallTop = if (dark) Color(0xFF1B1C1E) else colors.surface
    val rail = if (dark) Color.White else colors.fg2
    val farTone = if (dark) Color.Black else colors.surfaceMuted   // far bottles fade towards this
    val shadowAlpha = if (dark) 0.4f else 0.14f
    val frame = if (dark) colors.hairline else lerp(colors.hairline, colors.muted, 0.45f)
    val outline = if (dark) 0.55f else 0.25f            // bottle edge strength
    val scope = rememberCoroutineScope()
    val open by rememberUpdatedState(onOpen)
    val yaw = remember { Animatable(-0.55f) }     // turn left/right, in radians
    val pitch = remember { Animatable(0.32f) }    // tilt up/down
    var touches by remember { mutableIntStateOf(0) }
    // Where each bottle was last drawn (screen point, depth), so a tap can find it.
    val drawn = remember { mutableListOf<Triple<Offset, Float, Bottle>>() }

    // Restarts on every touch; after ten quiet seconds the view sways around its current angle.
    LaunchedEffect(touches) {
        delay(10_000)
        val base = yaw.value
        val start = withFrameNanos { it }
        while (true) {
            val now = withFrameNanos { it }
            yaw.snapTo(base + (0.32 * sin((now - start) / 4e9)).toFloat())
        }
    }

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(0.8f)
                .pointerInput(Unit) {
                    detectDragGestures(onDragStart = { touches++ }) { _, d ->
                        scope.launch {
                            yaw.snapTo(yaw.value + d.x / density * 0.008f)
                            pitch.snapTo((pitch.value + d.y / density * 0.006f).coerceIn(-1.2f, 1.35f))
                        }
                    }
                }
                .pointerInput(Unit) {
                    detectTapGestures { p ->
                        touches++
                        drawn.filter { (it.first - p).getDistance() < 22.dp.toPx() }.minByOrNull { it.second }?.let { open(it.third) }
                    }
                },
        ) {
            val w = cellar.widthCm
            val h = cellar.heightCm
            val deep = cellar.depthCm
            // ---- camera: rotate around the cellar's centre, then perspective ----
            val dist = maxOf(w, h, deep) * 2.4f
            val f = min(size.width, size.height * 0.9f) * 0.48f * dist / (max(w, h) * 0.55f)
            val cY = cos(yaw.value)
            val sY = sin(yaw.value)
            val cP = cos(pitch.value)
            val sP = sin(pitch.value)
            fun rot(x: Float, y: Float, z: Float): V {
                val x1 = x * cY + z * sY
                val z1 = -x * sY + z * cY
                return V(x1, y * cP - z1 * sP, y * sP + z1 * cP)
            }
            fun proj(x: Float, y: Float, z: Float): V {
                val r = rot(x - w / 2, y - h / 2, z - deep / 2)
                val k = f / (dist + r.z)
                return V(size.width / 2 + r.x * k, size.height / 2 - r.y * k, r.z)
            }
            fun poly(vararg points: V) = pathOf(points.map { proj(it.x, it.y, it.z).let { p -> Offset(p.x, p.y) } })

            // ---- walls: a wall is drawn only when its inner side faces the camera ----
            val faces = listOf(
                Face(wallBack, V(0f, 0f, -1f), V(0f, 0f, deep), V(w, 0f, deep), V(w, h, deep), V(0f, h, deep)),
                Face(wallSide, V(1f, 0f, 0f), V(0f, 0f, 0f), V(0f, 0f, deep), V(0f, h, deep), V(0f, h, 0f)),
                Face(wallSide, V(-1f, 0f, 0f), V(w, 0f, 0f), V(w, 0f, deep), V(w, h, deep), V(w, h, 0f)),
                Face(wallFloor, V(0f, 1f, 0f), V(0f, 0f, 0f), V(w, 0f, 0f), V(w, 0f, deep), V(0f, 0f, deep)),
                Face(wallTop, V(0f, -1f, 0f), V(0f, h, 0f), V(w, h, 0f), V(w, h, deep), V(0f, h, deep)),
            )
            for (face in faces) {
                val a = face.corners[0]
                val c = face.corners[2]
                val centre = rot((a.x + c.x) / 2 - w / 2, (a.y + c.y) / 2 - h / 2, (a.z + c.z) / 2 - deep / 2)
                val n = rot(face.n.x, face.n.y, face.n.z)
                if (n.x * -centre.x + n.y * -centre.y + n.z * (-dist - centre.z) > 0) {
                    drawPath(poly(*face.corners), face.color)
                    if (!dark) drawPath(poly(*face.corners), colors.hairline, style = Stroke(1.dp.toPx()))
                }
            }

            // ---- racks: a faint plane with a lit front rail ----
            for (rack in cellar.racks) {
                if (rack.kind == "floor") continue
                val y = rack.yCm
                drawPath(poly(V(0f, y, 2f), V(w, y, 2f), V(w, y, rack.depthCm), V(0f, y, rack.depthCm)), rail, alpha = if (dark) 0.03f else 0.05f)
                val a = proj(0f, y, 2f)
                val b = proj(w, y, 2f)
                drawLine(rail, Offset(a.x, a.y), Offset(b.x, b.y), strokeWidth = 2.dp.toPx(), cap = StrokeCap.Round, alpha = if (dark) 0.28f else 0.45f)
            }

            // ---- bottles, far ones first ----
            val sorted = cellar.bottles.map { it to proj(it.x, it.y, it.z + BL / 2).z }.sortedByDescending { it.second }
            val near = sorted.lastOrNull()?.second ?: 0f
            val far = sorted.firstOrNull()?.second ?: 0f
            for ((b, _) in sorted) {
                if (b.orientation == "standing") continue
                // a soft shadow where the bottle rests
                val z0 = max(1f, b.z)
                val ys = b.y - BD / 2 + 0.3f
                val half = BD * 0.55f
                drawPath(poly(V(b.x - half, ys, z0), V(b.x + half, ys, z0), V(b.x + half, ys, z0 + BL * 0.9f), V(b.x - half, ys, z0 + BL * 0.9f)), Color.Black, alpha = shadowAlpha)
            }
            drawn.clear()
            for ((b, depth) in sorted) {
                val standing = b.orientation == "standing"
                val z0 = max(1f, b.z)
                fun at(t: Float) = if (standing) proj(b.x, b.y - BD / 2 + BL * t, z0) else proj(b.x, b.y, z0 + BL * t)
                // The silhouette: body, shoulder, neck, as (position along the bottle, share of the radius).
                val profile = listOf(0f to 1f, 0.6f to 1f, 0.74f to 0.36f, 0.95f to 0.3f).map { (t, k) ->
                    val p = at(t)
                    p to BD / 2 * k * f / (dist + p.z)
                }
                val base = profile[0].first
                val tip = profile[3].first
                var dx = profile[1].first.x - base.x
                var dy = profile[1].first.y - base.y
                val length = hypot(dx, dy)
                if (length > 0f) {
                    dx /= length
                    dy /= length
                }
                fun side(s: Float) = profile.map { (p, r) -> Offset(p.x - dy * r * s, p.y + dx * r * s) }
                val body = pathOf(side(1f) + side(-1f).reversed())
                val lit = if (dx <= 0f) 1f else -1f // light comes from above
                fun band(from: Float, to: Float): Path {
                    val a = side(lit * from)
                    val c = side(lit * to)
                    return pathOf(listOf(a[0], a[1], c[1], c[0]))
                }
                // Far bottles fade a little (towards black on the dark theme, towards the page on the light one).
                val fade = 1f - (if (dark) 0.4f else 0.3f) * (if (far > near) (depth - near) / (far - near) else 0f)
                val tint = lerp(farTone, wineTint(b.wine.color), fade)
                // The bottle end: a circle that flattens to an ellipse as the bottle turns away.
                val r = profile[0].second
                val ratio = min(1f, length / max(0.01f, BL * 0.6f * f / (dist + base.z)))
                val rx = max(0.6f, r * sqrt(max(0f, 1 - ratio * ratio)))
                val endFacesUs = base.z < tip.z
                fun end() = rotate(atan2(dy, dx) * 180f / PI.toFloat(), Offset(base.x, base.y)) {
                    drawOval(tint, Offset(base.x - rx, base.y - r), Size(rx * 2, r * 2))
                    if (endFacesUs) {
                        drawOval(Color.White, Offset(base.x - rx * 0.8f, base.y - r * 0.8f), Size(rx * 1.6f, r * 1.6f), alpha = 0.14f, style = Stroke(1.dp.toPx()))
                        drawOval(Color.Black, Offset(base.x - rx * 0.36f, base.y - r * 0.36f), Size(rx * 0.72f, r * 0.72f), alpha = 0.45f)
                    }
                }
                if (!endFacesUs) end()
                drawPath(body, tint)
                drawPath(body, Color.Black, alpha = outline, style = Stroke(1.dp.toPx()))
                drawPath(band(0.2f, 0.5f), Color.White, alpha = 0.16f)
                drawPath(band(-0.55f, -1f), Color.Black, alpha = 0.38f)
                if (endFacesUs) end()
                if (b.id == highlightId) drawPath(body, colors.accent, style = Stroke(2.5.dp.toPx()))
                drawn += Triple(Offset((base.x + tip.x) / 2, (base.y + tip.y) / 2), depth, b)
            }

            // ---- the glass door, with a faint reflection and its frame ----
            val door = poly(V(0f, 0f, 0f), V(w, 0f, 0f), V(w, h, 0f), V(0f, h, 0f))
            drawPath(door, Color(0xFFB4C8DC), alpha = 0.03f)
            drawPath(poly(V(w * 0.52f, h, 0f), V(w * 0.64f, h, 0f), V(w * 0.3f, 0f, 0f), V(w * 0.18f, 0f, 0f)), Color.White, alpha = 0.035f)
            drawPath(door, frame, style = Stroke(3.dp.toPx()))
        }

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Drag to turn", style = AppType.caption, color = colors.muted, modifier = Modifier.weight(1f))
            for ((label, toYaw, toPitch) in PRESETS) {
                Pill(
                    text = label,
                    on = false,
                    onClick = {
                        touches++
                        scope.launch { yaw.animateTo(toYaw, tween(560)) }
                        scope.launch { pitch.animateTo(toPitch, tween(560)) }
                    },
                )
            }
        }
    }
}
