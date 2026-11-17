package com.example.omnicave.ui.sommelier

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.omnicave.data.Api
import com.example.omnicave.data.ApiException
import com.example.omnicave.data.Bottle
import com.example.omnicave.data.Persona
import com.example.omnicave.data.text
import com.example.omnicave.data.vintageLabel
import com.example.omnicave.ui.components.AppTextField
import com.example.omnicave.ui.components.LinkButton
import com.example.omnicave.ui.components.PageHead
import com.example.omnicave.ui.components.Pill
import com.example.omnicave.ui.components.PrimaryButton
import com.example.omnicave.ui.components.SecondaryButton
import com.example.omnicave.ui.components.WindowBadge
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.put

/** One thing said at the table. [speaker] is "user" or a sommelier's id. */
data class Msg(val speaker: String, val text: String = "", val pick: Bottle? = null, val streaming: Boolean = false)

/** What the table talks about: one wine, or a question. [json] is the form the server expects. */
class Topic(val title: String, val isWine: Boolean, val json: JsonObject)

class Parsed(val body: String, val score: String?, val peak: Int?)

private val SCORE = Regex("""\n?\s*Score:\s*([^\n]+?)\.?\s*Peak:\s*(\d{4})\.?\s*$""", RegexOption.IGNORE_CASE)
private val BOTTLE_REF = Regex("""#\d+\s*[—:-]?\s*""")

/** Wine turns end with "Score: 94. Peak: 2028." That line is taken out of the text and shown as a badge. */
fun parseMessage(text: String): Parsed {
    val m = SCORE.find(text)
    val body = (if (m != null) text.substring(0, m.range.first) else text).replace(BOTTLE_REF, "").trim()
    return Parsed(body, m?.groupValues?.get(1)?.trim(), m?.groupValues?.get(2)?.toIntOrNull())
}

/** Puts scores on different scales (94, 17/20, ★★★★) on one 0–100 scale, to see whether the table agrees. */
private fun normalized(label: String): Double {
    val stars = label.count { it == '★' }
    if (stars > 0) return stars * 20.0
    Regex("""([\d.]+)\s*/\s*20""").find(label)?.let { return (it.groupValues[1].toDoubleOrNull() ?: 0.0) * 5 }
    return Regex("""\d+(\.\d+)?""").find(label)?.value?.toDoubleOrNull() ?: 0.0
}

private fun personaColor(hex: String): Color = try {
    Color(android.graphics.Color.parseColor(hex))
} catch (e: IllegalArgumentException) {
    Color(0xFF4A4F55)
}

/** A sommelier's round badge with their initials on their own colour. */
@Composable
fun PersonaAvatar(name: String, color: String, size: Dp, modifier: Modifier = Modifier) {
    Box(modifier = modifier.size(size).background(personaColor(color), CircleShape), contentAlignment = Alignment.Center) {
        Text(
            text = name.split(" ").filter { it.isNotBlank() }.take(2).joinToString("") { it.take(1) }.uppercase(),
            style = AppType.bodyStrong.copy(fontSize = (size.value * 0.36f).sp),
            color = Color.White,
        )
    }
}

/** What one sommelier said: who, their score, the text, and the bottle they picked, if any. */
@Composable
fun SommelierMessage(p: Persona, m: Msg, onPick: (Bottle) -> Unit) {
    val colors = AppTheme.colors
    val parsed = parseMessage(m.text)
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        PersonaAvatar(p.name, p.color, 36.dp)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(p.name, style = AppType.bodyStrong, color = colors.fg)
                Text(p.title, style = AppType.caption, color = colors.muted, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                parsed.score?.let {
                    Text(
                        text = it,
                        style = AppType.caption.copy(fontWeight = FontWeight.Medium),
                        color = colors.accent,
                        modifier = Modifier.background(colors.accentSoft, RoundedCornerShape(6.dp)).padding(horizontal = 8.dp, vertical = 2.dp),
                    )
                }
            }
            Text(parsed.body + if (m.streaming) " ▍" else "", style = AppType.body, color = colors.fg2)
            parsed.peak?.let { Text("Peak $it", style = AppType.caption, color = colors.muted) }
            m.pick?.let { b ->
                Row(
                    modifier = Modifier.fillMaxWidth().background(colors.surface, RoundedCornerShape(10.dp)).clickable { onPick(b) }.padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("${b.wine.name} ${b.wine.vintageLabel}", style = AppType.bodyStrong, color = colors.fg)
                        Text(b.location.replace(Regex(" · (front|back)$"), ""), style = AppType.caption, color = colors.muted)
                    }
                    WindowBadge(b.windowStatus)
                }
            }
        }
    }
}

private val QUICK_WINE = listOf("Who's right?", "Explain it simply", "What should I eat with it?", "When should I open it?")
private val QUICK_QUESTION = listOf("Why that bottle?", "Something lighter?", "What about value?")

/** The tasting table: each sommelier speaks once, then the table waits for Continue, Join in, or End for a verdict. */
@Composable
fun TastingScreen(topic: Topic, seats: List<Persona>, onBack: () -> Unit, onPick: (Bottle) -> Unit, modifier: Modifier = Modifier) {
    val colors = AppTheme.colors
    val scope = rememberCoroutineScope()
    val msgs = remember { mutableStateListOf<Msg>() }
    var running by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var ended by remember { mutableStateOf(false) }
    var joining by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf("") }
    var job by remember { mutableStateOf<Job?>(null) }
    val scroll = rememberScrollState()
    fun person(id: String) = seats.firstOrNull { it.id == id } ?: Persona(id, "Sommelier")

    /** One round: every seated sommelier answers the conversation so far. The text arrives piece by piece. */
    fun round(userText: String? = null) {
        job?.cancel()
        job = scope.launch {
            if (userText != null) msgs += Msg("user", userText)
            running = true
            error = null
            val body = buildJsonObject {
                put("topic", topic.json)
                put("persona_ids", buildJsonArray { seats.forEach { add(kotlinx.serialization.json.JsonPrimitive(it.id)) } })
                put("history", buildJsonArray {
                    msgs.forEach { m -> addJsonObject { put("speaker", m.speaker); put("text", m.text) } }
                })
            }.toString()
            try {
                Api.stream("/api/ai/table", body).collect { e ->
                    val last = msgs.lastIndex
                    when (e.text("type")) {
                        "turn" -> msgs += Msg(e.text("persona"), streaming = true)
                        "delta" -> if (last >= 0) msgs[last] = msgs[last].copy(text = msgs[last].text + e.text("text"))
                        "pick" -> runCatching { Api.json.decodeFromJsonElement<Bottle>(e.getValue("bottle")) }.getOrNull()
                            ?.let { if (last >= 0) msgs[last] = msgs[last].copy(pick = it) }
                        "turn_end" -> if (last >= 0) msgs[last] = msgs[last].copy(streaming = false)
                        "error" -> error = e.text("message")
                    }
                }
            } catch (e: ApiException) {
                error = e.message
            } finally {
                for (i in msgs.indices) if (msgs[i].streaming) msgs[i] = msgs[i].copy(streaming = false)
                running = false
            }
        }
    }

    // A fresh tasting starts by itself, and the view follows the newest text.
    LaunchedEffect(Unit) { round() }
    LaunchedEffect(Unit) { snapshotFlow { scroll.maxValue }.collect { scroll.scrollTo(it) } }

    Column(modifier = modifier.fillMaxSize().padding(horizontal = 20.dp).padding(bottom = 12.dp)) {
        PageHead(topic.title, onBack = onBack)
        Column(modifier = Modifier.weight(1f).verticalScroll(scroll).padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            for (m in msgs) {
                if (m.speaker == "user") {
                    Text(
                        text = m.text,
                        style = AppType.body,
                        color = colors.fg,
                        modifier = Modifier.align(Alignment.End).background(colors.accentSoft, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                } else {
                    SommelierMessage(person(m.speaker), m, onPick)
                }
            }
            if (running && msgs.none { it.streaming }) Text("The sommeliers are tasting…", style = AppType.body, color = colors.muted)
            error?.let { Text(it, style = AppType.caption, color = colors.danger) }
            if (ended) Verdict(topic.isWine, msgs, seats, onPick)
        }

        when {
            ended -> SecondaryButton("Back to sommeliers", onClick = onBack)
            running -> Row(verticalAlignment = Alignment.CenterVertically) {
                val speaker = msgs.lastOrNull()?.speaker
                Text(
                    text = if (speaker != null && speaker != "user") "${person(speaker).name.substringBefore(' ')} is speaking…" else "Listening…",
                    style = AppType.body,
                    color = colors.muted,
                    modifier = Modifier.weight(1f),
                )
                SecondaryButton("Stop", onClick = { job?.cancel() })
            }
            joining -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val send = { text: String ->
                    joining = false
                    draft = ""
                    round(text)
                }
                Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    for (q in if (topic.isWine) QUICK_WINE else QUICK_QUESTION) Pill(text = q, on = false, onClick = { send(q) })
                }
                AppTextField(draft, { draft = it }, label = "", placeholder = "Say something to the table…")
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    LinkButton("Cancel", onClick = { joining = false })
                    PrimaryButton("Send", onClick = { send(draft.trim()) }, enabled = draft.isNotBlank(), modifier = Modifier.weight(1f))
                }
            }
            else -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                SecondaryButton("Continue", onClick = { round() })
                SecondaryButton("Join in", onClick = { joining = true })
                PrimaryButton("End & verdict", onClick = { ended = true }, enabled = msgs.isNotEmpty(), modifier = Modifier.weight(1f))
            }
        }
    }
}

/** For a wine: every sommelier's latest score and whether they agree. For a question: the bottle each one picked. */
@Composable
private fun Verdict(isWine: Boolean, msgs: List<Msg>, seats: List<Persona>, onPick: (Bottle) -> Unit) {
    val colors = AppTheme.colors
    Column(
        modifier = Modifier.fillMaxWidth().background(colors.surface, RoundedCornerShape(14.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (isWine) {
            val scores = seats.mapNotNull { p ->
                msgs.lastOrNull { it.speaker == p.id && parseMessage(it.text).score != null }?.let { p to parseMessage(it.text) }
            }
            val numbers = scores.map { normalized(it.second.score.orEmpty()) }
            val split = numbers.size > 1 && numbers.max() - numbers.min() > 6
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Verdict", style = AppType.title, color = colors.fg, modifier = Modifier.weight(1f))
                if (scores.isNotEmpty()) {
                    Text(if (split) "Split decision" else "Consensus", style = AppType.bodyStrong, color = if (split) colors.warn else colors.ok)
                }
            }
            if (scores.isEmpty()) Text("No scores yet. Let them talk a little longer.", style = AppType.body, color = colors.muted)
            for ((p, parsed) in scores) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    PersonaAvatar(p.name, p.color, 32.dp)
                    Text(p.name, style = AppType.bodyStrong, color = colors.fg, modifier = Modifier.weight(1f))
                    Text(parsed.score.orEmpty(), style = AppType.heading, color = colors.accent)
                    Text("peak ${parsed.peak ?: "—"}", style = AppType.caption, color = colors.muted)
                }
            }
        } else {
            Text("Their picks", style = AppType.title, color = colors.fg)
            val picks = seats.mapNotNull { p -> msgs.lastOrNull { it.speaker == p.id && it.pick != null }?.pick?.let { p to it } }
            if (picks.isEmpty()) Text("No bottles were picked.", style = AppType.body, color = colors.muted)
            for ((p, b) in picks) {
                Row(
                    modifier = Modifier.fillMaxWidth().clickable { onPick(b) },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    PersonaAvatar(p.name, p.color, 32.dp)
                    Column {
                        Text(p.name, style = AppType.caption, color = colors.muted)
                        Text("${b.wine.name} ${b.wine.vintageLabel}", style = AppType.bodyStrong, color = colors.fg)
                    }
                }
            }
        }
    }
}
