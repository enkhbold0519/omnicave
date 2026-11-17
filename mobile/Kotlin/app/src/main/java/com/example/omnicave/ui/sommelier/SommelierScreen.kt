package com.example.omnicave.ui.sommelier

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.example.omnicave.data.Api
import com.example.omnicave.data.ApiException
import com.example.omnicave.data.Bottle
import com.example.omnicave.data.Persona
import com.example.omnicave.data.vintageLabel
import com.example.omnicave.data.wineKey
import com.example.omnicave.ui.components.AppIcons
import com.example.omnicave.ui.components.AppTextField
import com.example.omnicave.ui.components.PageHead
import com.example.omnicave.ui.components.PrimaryButton
import com.example.omnicave.ui.components.SectionHead
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** The four ways to start: (kind, title, what happens). */
private val STARTS = listOf(
    Triple("wine", "Discuss a wine", "Scores, tasting notes and when to open it"),
    Triple("tonight", "What to open tonight", "Each sommelier picks a bottle"),
    Triple("pairing", "Pair with a meal", "Tell them what you are eating"),
    Triple("open", "Ask anything", "Any question about your wine"),
)

/**
 * The Sommelier tab: your sommeliers and the ways to start a tasting, then the tasting itself.
 * [startWine] comes from "Ask the sommeliers" on a wine page and opens a new tasting for that wine.
 */
@Composable
fun SommelierScreen(
    startWine: Bottle?,
    onStarted: () -> Unit,
    backEnabled: Boolean,
    onPick: (Bottle) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = AppTheme.colors
    var personas by remember { mutableStateOf<List<Persona>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var newKind by remember { mutableStateOf<String?>(null) }
    var newWine by remember { mutableStateOf<Bottle?>(null) }
    var table by remember { mutableStateOf<Pair<Topic, List<Persona>>?>(null) }
    var listOpen by remember { mutableStateOf(false) }
    var editorOpen by remember { mutableStateOf(false) }
    var edited by remember { mutableStateOf<Persona?>(null) } // null in the editor means a new sommelier
    var reloads by remember { mutableIntStateOf(0) }

    LaunchedEffect(reloads) {
        try {
            personas = Api.get<List<Persona>>("/api/personas")
            error = null
        } catch (e: ApiException) {
            error = e.message
        }
    }
    val home = {
        table = null
        newKind = null
        newWine = null
        listOpen = false
        editorOpen = false
    }
    val openList = {
        home()
        listOpen = true
    }
    val edit = { p: Persona? ->
        edited = p
        editorOpen = true
    }
    LaunchedEffect(startWine) {
        if (startWine != null) {
            home()
            newWine = startWine
            newKind = "wine"
            onStarted()
        }
    }
    BackHandler(enabled = backEnabled && (newKind != null || table != null || listOpen || editorOpen)) {
        if (editorOpen) openList() else home()
    }

    val seated = table
    val kind = newKind
    if (editorOpen) {
        PersonaEditor(edited, onBack = openList, modifier = modifier, onSaved = {
            reloads++
            openList()
        })
    } else if (listOpen) {
        PersonaList(personas, onBack = home, onOpen = edit, modifier = modifier)
    } else if (seated != null) {
        TastingScreen(seated.first, seated.second, onBack = home, onPick = onPick, modifier = modifier)
    } else if (kind != null) {
        NewTasting(kind, newWine, personas, onBack = home, onEditPersonas = openList, onStart = { topic, seats -> table = topic to seats }, modifier = modifier)
    } else {
        Column(
            modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("A table of sommeliers who taste with you", style = AppType.caption, color = colors.muted)
            error?.let { Text(it, style = AppType.caption, color = colors.danger) }
            SectionHead("Your sommeliers · ${personas.size}", link = "Edit", onLink = openList)
            PersonaStrip(personas, selected = null, onClick = edit)
            SectionHead("Start a tasting", modifier = Modifier.padding(top = 6.dp))
            Column {
                for ((key, title, sub) in STARTS) {
                    val enabled = personas.size >= 2
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .alpha(if (enabled) 1f else 0.4f)
                            .clickable(enabled = enabled) { newKind = key }
                            .heightIn(min = 64.dp)
                            .padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(title, style = AppType.heading, color = colors.fg)
                            Text(sub, style = AppType.caption, color = colors.muted)
                        }
                        Icon(AppIcons.Chevron, contentDescription = null, tint = colors.muted, modifier = Modifier.size(20.dp))
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(colors.hairline))
                }
            }
        }
    }
}

/** The sommeliers side by side. With [selected] set, the chosen ones are ringed. */
@Composable
fun PersonaStrip(personas: List<Persona>, selected: List<String>?, onClick: (Persona) -> Unit) {
    val colors = AppTheme.colors
    Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (p in personas) {
            val on = selected?.contains(p.id) == true
            Column(
                modifier = Modifier.width(80.dp).clickable { onClick(p) }.padding(vertical = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Box(Modifier.border(2.dp, if (on) colors.accent else Color.Transparent, CircleShape).padding(4.dp)) {
                    PersonaAvatar(p.name, p.color, 52.dp)
                }
                Text(p.name.substringBefore(' '), style = AppType.bodyStrong, color = if (on || selected == null) colors.fg else colors.muted, maxLines = 1)
                Text(p.title, style = AppType.caption, color = colors.muted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/** The topic, then who sits at the table (2 to 5). */
@Composable
private fun NewTasting(
    kind: String,
    initialWine: Bottle?,
    personas: List<Persona>,
    onBack: () -> Unit,
    onEditPersonas: () -> Unit,
    onStart: (Topic, List<Persona>) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = AppTheme.colors
    var wine by remember { mutableStateOf(initialWine) }
    var text by remember { mutableStateOf("") }
    var seats by remember(personas) { mutableStateOf(personas.take(3).map { it.id }) }
    var picking by remember { mutableStateOf(false) }
    val chosen = wine
    val ready = seats.size >= 2 && when (kind) {
        "wine" -> chosen != null
        "tonight" -> true
        else -> text.trim().length > 1
    }

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        PageHead(STARTS.first { it.first == kind }.second, onBack = onBack)
        if (kind == "wine") {
            Row(
                modifier = Modifier.fillMaxWidth().background(colors.surface, RoundedCornerShape(12.dp)).clickable { picking = true }.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    if (chosen != null) {
                        Text(chosen.wine.name, style = AppType.bodyStrong, color = colors.fg)
                        Text("${chosen.wine.vintageLabel} · ${chosen.wine.producer}", style = AppType.caption, color = colors.muted)
                    } else {
                        Text("Choose a wine from your cellar", style = AppType.body, color = colors.muted)
                    }
                }
                Icon(AppIcons.Chevron, contentDescription = null, tint = colors.muted, modifier = Modifier.size(20.dp))
            }
        }
        if (kind == "pairing" || kind == "open") {
            AppTextField(
                value = text,
                onValueChange = { text = it.take(300) },
                label = if (kind == "pairing") "Your meal" else "Your question",
                placeholder = if (kind == "pairing") "e.g. Roast lamb with rosemary" else "e.g. Which of my wines will age the longest?",
            )
        }
        SectionHead("At the table · ${seats.size} of 5", link = "Add or edit", onLink = onEditPersonas)
        PersonaStrip(personas, selected = seats, onClick = { p ->
            seats = if (p.id in seats) seats - p.id else if (seats.size < 5) seats + p.id else seats
        })
        if (seats.size < 2) Text("Choose at least 2 sommeliers.", style = AppType.caption, color = colors.muted)
        PrimaryButton(
            text = "Start the tasting",
            enabled = ready,
            onClick = {
                val topic = if (kind == "wine" && chosen != null) {
                    Topic("${chosen.wine.name} ${chosen.wine.vintageLabel}", true, buildJsonObject {
                        put("kind", "wine")
                        put("bottle_id", chosen.id)
                    })
                } else {
                    Topic(if (kind == "tonight") "What to open tonight" else text.trim(), false, buildJsonObject {
                        put("kind", "question")
                        put("intent", kind)
                        put("text", text.trim())
                    })
                }
                onStart(topic, personas.filter { it.id in seats })
            },
        )
    }
    if (picking) {
        WinePicker(onClose = { picking = false }, onPick = {
            wine = it
            picking = false
        })
    }
}

/** A searchable list of the wines in all cellars. */
@Composable
private fun WinePicker(onPick: (Bottle) -> Unit, onClose: () -> Unit) {
    val colors = AppTheme.colors
    var all by remember { mutableStateOf<List<Bottle>>(emptyList()) }
    var query by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        try {
            all = Api.get<List<Bottle>>("/api/bottles?q=").distinctBy { it.wineKey }.sortedBy { it.wine.name.lowercase() }
        } catch (e: ApiException) {
            // the list stays empty
        }
    }
    Dialog(onDismissRequest = onClose) {
        Column(
            modifier = Modifier.background(colors.surface, RoundedCornerShape(16.dp)).padding(16.dp).heightIn(max = 480.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("Choose a wine", style = AppType.title, color = colors.fg)
            AppTextField(query, { query = it }, label = "", placeholder = "Search")
            LazyColumn {
                items(all.filter { "${it.wine.name} ${it.wine.producer} ${it.wine.vintage}".contains(query, ignoreCase = true) }, key = { it.id }) { b ->
                    Column(modifier = Modifier.fillMaxWidth().clickable { onPick(b) }.padding(vertical = 10.dp)) {
                        Text(b.wine.name, style = AppType.bodyStrong, color = colors.fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${b.wine.vintageLabel} · ${b.wine.producer}", style = AppType.caption, color = colors.muted)
                    }
                }
            }
        }
    }
}
