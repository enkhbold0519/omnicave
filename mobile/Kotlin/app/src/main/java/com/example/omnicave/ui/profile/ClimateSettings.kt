package com.example.omnicave.ui.profile

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.omnicave.data.Api
import com.example.omnicave.data.ApiException
import com.example.omnicave.data.EnvZone
import com.example.omnicave.data.Environment
import com.example.omnicave.ui.components.Pill
import com.example.omnicave.ui.components.SectionHead
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType
import kotlinx.coroutines.delay
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToInt

/** How far a zone may drift from its target before you are alerted: (name, °C, % humidity). */
private val LEVELS = listOf(Triple("Relaxed", 4.0, 15.0), Triple("Standard", 2.5, 12.0), Triple("Strict", 1.5, 8.0))

private fun round1(x: Double) = (x * 10).roundToInt() / 10.0
private fun degrees(x: Double) = "%.1f °C".format(Locale.US, x)
private fun humidity(x: Double) = "${x.roundToInt()} %"

/** [v] with its alert limits set around its targets as [level] says. "Custom" leaves the limits alone. */
private fun around(v: EnvZone, level: String): EnvZone {
    val l = LEVELS.firstOrNull { it.first == level } ?: return v
    return v.copy(
        tempMin = round1(v.targetTemp - l.second), tempMax = round1(v.targetTemp + l.second),
        humMin = maxOf(20.0, v.targetHum - l.third), humMax = minOf(95.0, v.targetHum + l.third),
    )
}

/** The level whose limits [v] has now, or "Custom". */
private fun levelOf(v: EnvZone): String = LEVELS.map { it.first }.firstOrNull {
    val a = around(v, it)
    abs(a.tempMin - v.tempMin) < 0.06 && abs(a.tempMax - v.tempMax) < 0.06 && abs(a.humMin - v.humMin) < 0.06 && abs(a.humMax - v.humMax) < 0.06
} ?: "Custom"

/** Targets and alert limits of the open cellar's climate zones. With more than one zone, pills choose the zone. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ClimateSettings(cellarId: Int?, toast: (String?) -> Unit) {
    var zones by remember { mutableStateOf<List<EnvZone>>(emptyList()) }
    var openId by remember { mutableStateOf<Int?>(null) }
    LaunchedEffect(cellarId) {
        try {
            if (cellarId != null) zones = Api.get<Environment>("/api/cellars/$cellarId/environment").zones
        } catch (e: ApiException) {
            toast(e.message)
        }
    }
    val zone = zones.firstOrNull { it.id == openId } ?: zones.firstOrNull()
    Text("You get a notification when a zone stays outside its range. Changes are saved automatically.", style = AppType.caption, color = AppTheme.colors.muted)
    if (zones.size > 1) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for (z in zones) Pill(z.name.substringAfterLast(" · "), on = z.id == zone?.id, onClick = { openId = z.id })
        }
    }
    if (zone != null) {
        key(zone.id) {
            ZoneSettings(zone, toast, onSaved = { saved -> zones = zones.map { if (it.id == saved.id) saved else it } })
        }
    }
}

/** One zone: two targets, how strict the alerts are, and how long to wait before alerting. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ZoneSettings(zone: EnvZone, toast: (String?) -> Unit, onSaved: (EnvZone) -> Unit) {
    val colors = AppTheme.colors
    var v by remember { mutableStateOf(zone) }
    var level by remember { mutableStateOf(levelOf(zone)) }

    // Saves a short pause after the last change; a newer change cancels the wait and starts it again.
    LaunchedEffect(v) {
        if (v == zone) return@LaunchedEffect
        delay(700)
        try {
            Api.request("PATCH", "/api/zones/${zone.id}", buildJsonObject {
                put("target_temp", v.targetTemp)
                put("target_hum", v.targetHum)
                put("temp_min", v.tempMin)
                put("temp_max", v.tempMax)
                put("hum_min", v.humMin)
                put("hum_max", v.humMax)
                put("alert_minutes", v.alertMinutes)
            }.toString())
            onSaved(v)
            toast("Saved")
        } catch (e: ApiException) {
            toast(e.message)
        }
    }

    Text("Now " + (zone.latest?.let { "${degrees(it.temp)} · ${humidity(it.hum)}" } ?: "—"), style = AppType.bodyStrong, color = colors.fg2)
    SectionHead("Keep at")
    // A level other than Custom moves the alert limits along with the target.
    Stepper("Temperature", degrees(v.targetTemp)) { d -> v = around(v.copy(targetTemp = round1(v.targetTemp + d * 0.5).coerceIn(4.0, 22.0)), level) }
    Stepper("Humidity", humidity(v.targetHum)) { d -> v = around(v.copy(targetHum = (v.targetHum + d).coerceIn(40.0, 90.0)), level) }

    SectionHead("Alert me when it drifts")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (l in LEVELS.map { it.first } + "Custom") {
            Pill(l, on = level == l, onClick = {
                level = l
                v = around(v, l)
            })
        }
    }
    Text(
        "Outside %.1f–%.1f °C or %d–%d %%.".format(Locale.US, v.tempMin, v.tempMax, v.humMin.roundToInt(), v.humMax.roundToInt()),
        style = AppType.caption,
        color = colors.muted,
    )
    if (level == "Custom") {
        Stepper("Lowest temperature", degrees(v.tempMin)) { d -> v = v.copy(tempMin = round1(v.tempMin + d * 0.5).coerceIn(0.0, maxOf(0.0, v.tempMax - 0.5))) }
        Stepper("Highest temperature", degrees(v.tempMax)) { d -> v = v.copy(tempMax = round1(v.tempMax + d * 0.5).coerceIn(minOf(30.0, v.tempMin + 0.5), 30.0)) }
        Stepper("Lowest humidity", humidity(v.humMin)) { d -> v = v.copy(humMin = (v.humMin + d).coerceIn(20.0, maxOf(20.0, v.humMax - 1))) }
        Stepper("Highest humidity", humidity(v.humMax)) { d -> v = v.copy(humMax = (v.humMax + d).coerceIn(minOf(95.0, v.humMin + 1), 95.0)) }
    }

    SectionHead("Alert after")
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (m in listOf(5, 15, 30, 60)) Pill("$m min", on = v.alertMinutes.roundToInt() == m, onClick = { v = v.copy(alertMinutes = m.toDouble()) })
    }
}

/** A value with a minus and a plus button. [onStep] gets -1 or +1. */
@Composable
private fun Stepper(label: String, value: String, onStep: (Int) -> Unit) {
    val colors = AppTheme.colors
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = AppType.body, color = colors.fg, modifier = Modifier.weight(1f))
        for ((sign, step) in listOf("−" to -1, "+" to 1)) {
            if (step == 1) Text(value, style = AppType.bodyStrong, color = colors.fg, textAlign = TextAlign.Center, modifier = Modifier.width(84.dp))
            Box(
                modifier = Modifier.size(40.dp).clip(CircleShape).border(1.dp, colors.hairline, CircleShape)
                    .clickable(onClickLabel = if (step == 1) "Raise $label" else "Lower $label") { onStep(step) },
                contentAlignment = Alignment.Center,
            ) {
                Text(sign, style = AppType.title, color = colors.fg)
            }
        }
    }
}
