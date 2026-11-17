package com.example.omnicave.ui.cellar

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.example.omnicave.data.Api
import com.example.omnicave.data.ApiException
import com.example.omnicave.data.Bottle
import com.example.omnicave.data.Cellar
import com.example.omnicave.data.EnvZone
import com.example.omnicave.data.Environment
import com.example.omnicave.ui.components.LineChart
import com.example.omnicave.ui.components.LinkButton
import com.example.omnicave.ui.components.Pill
import com.example.omnicave.ui.components.SecondaryButton
import com.example.omnicave.ui.theme.AppColors
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType
import com.example.omnicave.ui.theme.wineTint
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.Calendar
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.roundToInt

/** Bottle diameter in cm, the same value the backend uses to place bottles. */
private const val BOTTLE_D = 7.6f

/** "Upper · Sparkling & White" gives "Sparkling & White": what is stored there says more than where. */
private fun zoneLabel(name: String) = name.substringAfterLast(" · ")

private fun zoneState(z: EnvZone) = when {
    z.latest == null -> "Waiting for sensor"
    !z.sensorOnline -> "Sensor offline"
    z.inRange -> "Normal"
    else -> "Outside range"
}

private fun stateColor(state: String, colors: AppColors) = when (state) {
    "Normal" -> colors.ok
    "Outside range" -> colors.warn
    "Sensor offline" -> colors.danger
    else -> colors.muted
}

/**
 * The first page: a greeting, the climate of each zone, and the cellar drawn as seen through its door.
 * While [moving] is set, the next tap on the map is the new spot for that bottle.
 */
@Composable
fun CellarScreen(
    cellarId: Int?,
    reloadKey: Int,
    userName: String,
    highlightId: Int?,
    moving: Bottle?,
    onMoveDone: (Bottle?) -> Unit,
    onOpen: (Bottle) -> Unit,
    onAdd: () -> Unit,
    onInventory: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = AppTheme.colors
    val scope = rememberCoroutineScope()
    var cellar by remember { mutableStateOf<Cellar?>(null) }
    var zones by remember { mutableStateOf<List<EnvZone>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var zoneOpen by remember { mutableStateOf<EnvZone?>(null) }
    var backRow by remember(moving) { mutableStateOf(moving?.layer == "back") }
    var show3d by rememberSaveable { mutableStateOf(false) }

    // Load now, after a change, and again every 15 seconds so the climate stays current.
    LaunchedEffect(cellarId, reloadKey) {
        if (cellarId == null) return@LaunchedEffect
        while (true) {
            try {
                cellar = Api.get<Cellar>("/api/cellars/$cellarId")
                zones = Api.get<Environment>("/api/cellars/$cellarId/environment").zones
                error = null
            } catch (e: ApiException) {
                error = e.message
            }
            delay(15_000)
        }
    }

    val current = cellar
    val states = zones.orEmpty().map { zoneState(it) }
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            val greeting = if (hour in 5..11) "Good morning" else if (hour in 12..17) "Good afternoon" else "Good evening"
            Text("$greeting, $userName.", style = AppType.headline, color = colors.fg)
            if (zones != null && current != null) {
                Text(
                    text = when {
                        "Sensor offline" in states -> "Some sensors are offline. Readings may be out of date."
                        "Outside range" in states -> "Your cellar needs attention."
                        current.bottles.isEmpty() -> "Your cellar is ready for its first bottle."
                        else -> "Your collection is resting well."
                    },
                    style = AppType.body,
                    color = colors.fg2,
                )
            }
        }

        // Bottle count on the left, one column per climate zone. Tapping a zone opens its history.
        Row(modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min).clip(RoundedCornerShape(14.dp)).background(colors.surface)) {
            Column(
                modifier = Modifier.fillMaxHeight().clickable(onClick = onInventory).padding(16.dp),
                verticalArrangement = Arrangement.Center,
            ) {
                val count = current?.bottles?.size ?: 0
                Text(count.toString(), style = AppType.hero, color = colors.fg)
                Text(if (count == 1) "BOTTLE →" else "BOTTLES →", style = AppType.overline, color = colors.muted)
            }
            for (z in zones.orEmpty()) {
                val state = zoneState(z)
                Column(
                    modifier = Modifier.weight(1f).fillMaxHeight().clickable { zoneOpen = z }.padding(horizontal = 8.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(zoneLabel(z.name).uppercase(), style = AppType.overline, color = colors.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(z.latest?.let { "%.1f °C".format(it.temp) } ?: "—", style = AppType.title, color = colors.fg)
                    Text(z.latest?.let { "${it.hum.roundToInt()} %" } ?: "—", style = AppType.title, color = colors.fg)
                    Text(state, style = AppType.caption, color = stateColor(state, colors))
                }
            }
        }

        if (moving != null) {
            Column(
                modifier = Modifier.fillMaxWidth().background(colors.accentSoft, RoundedCornerShape(12.dp)).padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text("Tap the new spot for ${moving.wine.name}", style = AppType.bodyStrong, color = colors.fg)
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill(text = "Front row", on = !backRow, onClick = { backRow = false })
                    Pill(text = "Back row", on = backRow, onClick = { backRow = true })
                    SecondaryButton("Cancel", onClick = { onMoveDone(null) })
                }
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill(text = "Door", on = !show3d, onClick = { show3d = false })
                Pill(text = "3D", on = show3d, onClick = { show3d = true })
                Spacer(Modifier.weight(1f))
                LinkButton(text = "＋ Add bottle", onClick = onAdd)
            }
        }
        error?.let { Text(it, style = AppType.caption, color = colors.danger) }

        if (current == null) {
            Text("Loading cellar…", style = AppType.body, color = colors.muted)
        } else if (show3d && moving == null) {
            Cellar3D(cellar = current, highlightId = highlightId, onOpen = onOpen)
        } else {
            // Choosing a new spot always happens on the flat door view.
            CellarMap(
                cellar = current,
                zones = zones.orEmpty(),
                highlightId = moving?.id ?: highlightId,
                onTap = { x, y, hit ->
                    if (moving != null) {
                        scope.launch {
                            val body = buildJsonObject {
                                put("position", buildJsonObject {
                                    put("x", x)
                                    put("y", y)
                                    put("z", if (backRow) current.depthCm / 2 else 6f)
                                })
                            }.toString()
                            try {
                                onMoveDone(Api.decode<Bottle>(Api.request("PATCH", "/api/bottles/${moving.id}", body)))
                            } catch (e: ApiException) {
                                error = e.message
                            }
                        }
                    } else if (hit != null) {
                        onOpen(hit)
                    }
                },
            )
        }
    }

    val open = zoneOpen
    if (open != null && cellarId != null) ClimateHistory(cellarId, open, onClose = { zoneOpen = null })
}

/** Turns cellar centimetres into screen pixels, with the cellar centred in the drawing area. */
private class Fit(width: Float, height: Float, val w: Float, val h: Float) {
    val s = min(width / w, height / h)
    val left = (width - w * s) / 2
    val top = (height - h * s) / 2
    fun px(x: Float) = left + x * s
    fun py(y: Float) = top + (h - y) * s
}

/** The door view: zones as faint bands, shelves as lines, each bottle as its round end in the wine's colour. */
@Composable
private fun CellarMap(
    cellar: Cellar,
    zones: List<EnvZone>,
    highlightId: Int?,
    onTap: (x: Float, y: Float, hit: Bottle?) -> Unit,
) {
    val colors = AppTheme.colors
    val w = cellar.widthCm
    val h = cellar.heightCm
    Canvas(
        modifier = Modifier.fillMaxWidth().aspectRatio(w / h).pointerInput(cellar, onTap) {
            detectTapGestures { p ->
                val f = Fit(size.width.toFloat(), size.height.toFloat(), w, h)
                val x = (p.x - f.left) / f.s
                val y = h - (p.y - f.top) / f.s
                if (x < 0 || x > w || y < 0 || y > h) return@detectTapGestures
                // The nearest bottle under the finger, front row first.
                val hit = cellar.bottles
                    .filter { hypot(it.x - x, it.y - y) <= BOTTLE_D * 0.75f }
                    .minByOrNull { it.z }
                onTap(x, y, hit)
            }
        },
    ) {
        val f = Fit(size.width, size.height, w, h)
        drawRoundRect(colors.surface, Offset(f.left, f.top), Size(w * f.s, h * f.s), CornerRadius(8.dp.toPx()))
        for (z in zones) {
            val top = min(z.yTo, h)
            drawRect(
                color = if (z.name.startsWith("Upper")) colors.accent.copy(alpha = 0.06f) else colors.glow.copy(alpha = 0.05f),
                topLeft = Offset(f.left, f.py(top)),
                size = Size(w * f.s, (top - z.yFrom) * f.s),
            )
        }
        for (rack in cellar.racks) {
            if (rack.kind == "shelf") {
                drawLine(colors.hairline, Offset(f.left, f.py(rack.yCm)), Offset(f.left + w * f.s, f.py(rack.yCm)), strokeWidth = 2.dp.toPx())
            }
        }
        // Far bottles first, so the front row is drawn over the back row.
        for (b in cellar.bottles.sortedByDescending { it.z }) {
            val back = b.layer == "back"
            val r = BOTTLE_D / 2 * f.s * (if (back) 0.82f else 1f)
            val c = Offset(f.px(b.x), f.py(b.y))
            val tint = wineTint(b.wine.color)
            if (b.orientation == "standing") {
                drawRoundRect(tint, Offset(c.x - r, f.py(b.y - BOTTLE_D / 2 + 30)), Size(2 * r, 30 * f.s), CornerRadius(r))
            } else {
                drawCircle(tint, r, c, alpha = if (back) 0.55f else 1f)
                drawCircle(Color.White, r * 0.8f, c, alpha = 0.22f, style = Stroke(1.dp.toPx()))
                drawCircle(Color.Black, r * 0.36f, c, alpha = 0.45f)
            }
            if (b.id == highlightId) drawCircle(colors.accent, r + 4.dp.toPx(), c, style = Stroke(3.dp.toPx()))
        }
    }
}

/** Temperature and humidity of one zone over the last hour, 6 hours or day. */
@Composable
private fun ClimateHistory(cellarId: Int, zone: EnvZone, onClose: () -> Unit) {
    val colors = AppTheme.colors
    var minutes by remember { mutableIntStateOf(60) }
    var z by remember { mutableStateOf(zone) }
    LaunchedEffect(minutes) {
        try {
            Api.get<Environment>("/api/cellars/$cellarId/environment?minutes=$minutes").zones
                .firstOrNull { it.id == zone.id }?.let { z = it }
        } catch (e: ApiException) {
            // keep what is shown
        }
    }
    Dialog(onDismissRequest = onClose) {
        Column(
            modifier = Modifier.background(colors.surface, RoundedCornerShape(16.dp)).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(zoneLabel(z.name), style = AppType.title, color = colors.fg)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for ((m, label) in listOf(60 to "1 hour", 360 to "6 hours", 1440 to "24 hours")) {
                    Pill(text = label, on = minutes == m, onClick = { minutes = m })
                }
            }
            val color = if (zoneState(z) == "Outside range") colors.warn else colors.accent
            Metric(
                label = "Temperature",
                value = z.latest?.let { "%.1f °C".format(it.temp) } ?: "—",
                target = "Keep at %.1f °C".format(z.targetTemp),
                values = z.history.map { it.temp },
                band = z.tempMin to z.tempMax,
                color = color,
            )
            Metric(
                label = "Humidity",
                value = z.latest?.let { "${it.hum.roundToInt()} %" } ?: "—",
                target = "Keep at ${z.targetHum.roundToInt()} %",
                values = z.history.map { it.hum },
                band = z.humMin to z.humMax,
                color = color,
            )
            Text("The shaded band is your alert range.", style = AppType.caption, color = colors.muted)
        }
    }
}

@Composable
private fun Metric(label: String, value: String, target: String, values: List<Double>, band: Pair<Double, Double>, color: Color) {
    val colors = AppTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label.uppercase(), style = AppType.overline, color = colors.muted, modifier = Modifier.weight(1f))
            Text(target, style = AppType.caption, color = colors.muted)
        }
        Text(value, style = AppType.display, color = colors.fg)
        if (values.size > 1) {
            LineChart(values, Modifier.fillMaxWidth().height(90.dp), color = color, band = band)
        } else {
            Text("Not enough readings yet.", style = AppType.body, color = colors.muted)
        }
    }
}
