package com.example.omnicave.ui.sommelier

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.example.omnicave.data.Api
import com.example.omnicave.data.ApiException
import com.example.omnicave.data.Persona
import com.example.omnicave.data.PersonaTraits
import com.example.omnicave.ui.components.AppIcons
import com.example.omnicave.ui.components.AppTextField
import com.example.omnicave.ui.components.PageHead
import com.example.omnicave.ui.components.Pill
import com.example.omnicave.ui.components.PrimaryButton
import com.example.omnicave.ui.components.SecondaryButton
import com.example.omnicave.ui.components.SectionHead
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType
import kotlinx.coroutines.launch
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

// The choices of the editor as (value sent to the server, label). Same lists as the display.
private val COLORS = listOf("#7A3340", "#2F5D50", "#3E4F7A", "#7A5A2B", "#5B3F6E", "#2E6070", "#6B4A3A", "#4A4F55")
private val SCALES = listOf("hundred" to "100 points", "twenty" to "20 points", "stars" to "5 stars")
private val FOCUS = listOf("old-world" to "Old World", "new-world" to "New World", "everywhere" to "Everywhere")
private val LOVES = listOf(
    "power" to "Power", "elegance" to "Elegance", "acidity" to "Freshness", "oak" to "Oak",
    "fruit" to "Ripe fruit", "age" to "Ageing", "value" to "Value", "terroir" to "Terroir",
)
private val STRICT = listOf("1" to "Generous", "2" to "Kind", "3" to "Balanced", "4" to "Exacting", "5" to "Severe")
private val TONES = listOf("formal" to "Formal", "warm" to "Warm", "playful" to "Playful", "blunt" to "Blunt")

/** All sommeliers, built-in and your own. A row opens the editor; the button adds a new one. */
@Composable
fun PersonaList(personas: List<Persona>, onBack: () -> Unit, onOpen: (Persona?) -> Unit, modifier: Modifier = Modifier) {
    val colors = AppTheme.colors
    Column(modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 20.dp)) {
        PageHead("Your sommeliers", onBack = onBack)
        for (p in personas) {
            Row(
                modifier = Modifier.fillMaxWidth().clickable { onOpen(p) }.padding(vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                PersonaAvatar(p.name, p.color, 48.dp)
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(p.name, style = AppType.heading, color = colors.fg)
                    Text(p.title + if (p.builtIn) " · built-in" else "", style = AppType.caption, color = colors.muted)
                }
                Icon(AppIcons.Chevron, contentDescription = null, tint = colors.muted, modifier = Modifier.size(20.dp))
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(colors.hairline))
        }
        SecondaryButton("＋ Add a sommelier", onClick = { onOpen(null) }, modifier = Modifier.padding(top = 20.dp).fillMaxWidth())
    }
}

/**
 * Who a sommelier is and how they judge. [persona] is null for a new one.
 * Built-in sommeliers are shown read-only; only what they remember can be cleared.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PersonaEditor(persona: Persona?, onBack: () -> Unit, onSaved: () -> Unit, modifier: Modifier = Modifier) {
    val colors = AppTheme.colors
    val scope = rememberCoroutineScope()
    val builtIn = persona?.builtIn == true
    var name by remember { mutableStateOf(persona?.name ?: "") }
    var title by remember { mutableStateOf(persona?.title ?: "") }
    var color by remember { mutableStateOf(persona?.color ?: COLORS[1]) }
    var traits by remember { mutableStateOf(persona?.traits ?: PersonaTraits()) }
    var memory by remember { mutableStateOf(persona?.memory ?: emptyList()) }
    var confirmDelete by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun send(method: String, path: String, body: String? = null, then: () -> Unit) {
        scope.launch {
            try {
                Api.request(method, path, body)
                then()
            } catch (e: ApiException) {
                error = e.message
            }
        }
    }
    val save = {
        val body = buildJsonObject {
            put("name", name.trim())
            put("title", title.trim())
            put("color", color)
            putJsonObject("traits") {
                put("scoring", traits.scoring)
                put("focus", traits.focus)
                putJsonArray("loves") { traits.loves.forEach { add(it) } }
                put("strictness", traits.strictness)
                put("tone", traits.tone)
                put("description", traits.description.trim())
            }
        }.toString()
        if (persona == null) send("POST", "/api/personas", body, onSaved) else send("PATCH", "/api/personas/${persona.id}", body, onSaved)
    }

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        PageHead(persona?.name ?: "New sommelier", onBack = onBack)
        if (builtIn) {
            Text(
                "A built-in sommelier. You can't change how they judge, but you can clear what they remember about you.",
                style = AppType.caption,
                color = colors.muted,
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            PersonaAvatar(name.ifBlank { "?" }, color, 72.dp)
            Column(modifier = Modifier.weight(1f).alpha(if (builtIn) 0.6f else 1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AppTextField(name, { name = it.take(40) }, label = "Name", placeholder = "e.g. Mina Park", enabled = !builtIn)
                AppTextField(title, { title = it.take(60) }, label = "Role", placeholder = "e.g. The Value Hunter", enabled = !builtIn)
            }
        }

        if (builtIn) {
            val philosophy = persona?.philosophy.orEmpty()
            if (philosophy.isNotEmpty()) {
                SectionHead("How they judge")
                Text(philosophy, style = AppType.body, color = colors.fg2)
            }
        } else {
            SectionHead("Colour")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                for (c in COLORS) {
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .clickable(onClickLabel = "Colour $c") { color = c }
                            .border(2.dp, if (color == c) colors.fg else Color.Transparent, CircleShape)
                            .padding(5.dp),
                    ) {
                        PersonaAvatar("", c, 30.dp)
                    }
                }
            }
            Choice("Scores on", SCALES, on = { it == traits.scoring }) { traits = traits.copy(scoring = it) }
            Choice("Looks mostly at", FOCUS, on = { it == traits.focus }) { traits = traits.copy(focus = it) }
            Choice("Loves · up to 3", LOVES, on = { it in traits.loves }) {
                val loves = traits.loves
                traits = traits.copy(loves = if (it in loves) loves - it else if (loves.size < 3) loves + it else loves)
            }
            Choice("Strictness", STRICT, on = { it == traits.strictness.toString() }) { traits = traits.copy(strictness = it.toInt()) }
            Choice("Tone", TONES, on = { it == traits.tone }) { traits = traits.copy(tone = it) }
            SectionHead("In their own words")
            AppTextField(
                value = traits.description,
                onValueChange = { traits = traits.copy(description = it.take(400)) },
                label = "",
                placeholder = "Anything else about how they taste and talk",
                lines = 3,
            )
        }

        if (persona != null) {
            SectionHead(
                "Remembers about you",
                link = if (memory.isNotEmpty()) "Clear" else null,
                onLink = { send("DELETE", "/api/personas/${persona.id}/memory") { memory = emptyList() } },
            )
            if (memory.isEmpty()) {
                Text("Nothing yet. Tell them at a tasting, e.g. “I love Riesling”.", style = AppType.caption, color = colors.muted)
            }
            for (m in memory) Text("•  $m", style = AppType.body, color = colors.fg2)
        }

        error?.let { Text(it, style = AppType.caption, color = colors.danger) }
        if (!builtIn) {
            PrimaryButton(
                text = if (persona != null) "Save Changes" else "Add sommelier",
                enabled = name.isNotBlank() && traits.loves.isNotEmpty(),
                onClick = save,
            )
            if (persona != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (confirmDelete) {
                        SecondaryButton("Delete ${persona.name.substringBefore(' ')}", danger = true, onClick = {
                            send("DELETE", "/api/personas/${persona.id}", then = onSaved)
                        })
                        SecondaryButton("Keep", onClick = { confirmDelete = false })
                    } else {
                        SecondaryButton("Delete", danger = true, onClick = { confirmDelete = true })
                    }
                }
            }
        }
    }
}

/** One question of the editor: a title and its answers as pills that wrap onto more lines. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Choice(title: String, options: List<Pair<String, String>>, on: (String) -> Boolean, onClick: (String) -> Unit) {
    SectionHead(title)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for ((value, label) in options) Pill(label, on = on(value), onClick = { onClick(value) })
    }
}
