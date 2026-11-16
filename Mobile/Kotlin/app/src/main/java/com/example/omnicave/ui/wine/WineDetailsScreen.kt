package com.example.omnicave.ui.wine

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
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.omnicave.data.Api
import com.example.omnicave.data.ApiException
import com.example.omnicave.data.Bottle
import com.example.omnicave.data.Persona
import com.example.omnicave.data.PriceHistory
import com.example.omnicave.data.PricePoint
import com.example.omnicave.data.Reading
import com.example.omnicave.data.money
import com.example.omnicave.data.percent
import com.example.omnicave.data.styleName
import com.example.omnicave.data.text
import com.example.omnicave.data.wineKey
import com.example.omnicave.ui.components.AppIcons
import com.example.omnicave.ui.components.LineChart
import com.example.omnicave.ui.components.SecondaryButton
import com.example.omnicave.ui.components.WindowBadge
import com.example.omnicave.ui.sommelier.Msg
import com.example.omnicave.ui.sommelier.SommelierMessage
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType
import kotlinx.coroutines.launch
import java.net.URLEncoder
import kotlin.math.roundToInt

/**
 * One wine as a full page over the current tab: the essentials at a glance, the long parts folded.
 * [onChanged] is called after a bottle was opened or removed, so lists behind this page can reload.
 * Find and Move jump to the cellar map; Ask the sommeliers opens a tasting for this wine.
 */
@Composable
fun WineDetailsScreen(
    bottle: Bottle,
    onClose: () -> Unit,
    onEdit: (Bottle) -> Unit,
    onFind: (Bottle) -> Unit,
    onMove: (Bottle) -> Unit,
    onAsk: (Bottle) -> Unit,
    onChanged: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = AppTheme.colors
    val scope = rememberCoroutineScope()
    val wine = bottle.wine

    var bottles by remember { mutableStateOf(listOf(bottle)) }
    var selectedId by remember { mutableIntStateOf(bottle.id) }
    var shelf by remember { mutableStateOf<Reading?>(null) }
    var confirm by remember { mutableStateOf<String?>(null) } // "consumed" or "removed"
    var error by remember { mutableStateOf<String?>(null) }
    var priceOpen by remember { mutableStateOf(false) }
    var prices by remember { mutableStateOf<List<PricePoint>?>(null) }
    val selected = bottles.firstOrNull { it.id == selectedId } ?: bottle
    // The two AI sections. Each asks the server the first time it is opened; the text arrives piece by piece.
    var debateOpen by remember { mutableStateOf(false) }
    val turns = remember { mutableStateListOf<Pair<Persona, Msg>>() }
    var pairingOpen by remember { mutableStateOf(false) }
    var pairing by remember { mutableStateOf("") }
    LaunchedEffect(debateOpen) {
        if (!debateOpen || turns.isNotEmpty()) return@LaunchedEffect
        try {
            Api.stream("/api/ai/table", """{"topic":{"kind":"wine","bottle_id":${bottle.id}}}""").collect { e ->
                val last = turns.lastOrNull()
                when (e.text("type")) {
                    "turn" -> turns += Persona(e.text("persona"), e.text("name"), e.text("title"), e.text("color")) to Msg(e.text("persona"), streaming = true)
                    "delta" -> if (last != null) turns[turns.lastIndex] = last.first to last.second.copy(text = last.second.text + e.text("text"))
                    "turn_end" -> if (last != null) turns[turns.lastIndex] = last.first to last.second.copy(streaming = false)
                }
            }
        } catch (e: ApiException) {
            // the section stays empty
        }
    }
    LaunchedEffect(pairingOpen) {
        if (!pairingOpen || pairing.isNotEmpty()) return@LaunchedEffect
        try {
            Api.stream("/api/ai/pairing/wine", """{"bottle_id":${bottle.id}}""").collect { e ->
                if (e.text("type") == "delta") pairing += e.text("text")
            }
        } catch (e: ApiException) {
            pairing = e.message.orEmpty()
        }
    }

    // Every bottle of this wine, in all cellars.
    LaunchedEffect(Unit) {
        try {
            val found = Api.get<List<Bottle>>("/api/bottles?field=name&q=" + URLEncoder.encode(wine.name, "UTF-8"))
                .filter { it.wineKey == bottle.wineKey }
            if (found.isNotEmpty()) bottles = found
        } catch (e: ApiException) {
            // keep showing the one bottle we were given
        }
    }
    // The list does not carry the shelf's climate; a single bottle does.
    LaunchedEffect(selectedId) {
        shelf = try {
            Api.get<Bottle>("/api/bottles/$selectedId").zone?.latest
        } catch (e: ApiException) {
            null
        }
    }
    LaunchedEffect(priceOpen) {
        if (priceOpen && prices == null) {
            prices = try {
                Api.get<PriceHistory>("/api/bottles/$selectedId/price-history").history
            } catch (e: ApiException) {
                emptyList()
            }
        }
    }

    fun remove(reason: String) = scope.launch {
        try {
            Api.request("DELETE", "/api/bottles/${selected.id}?reason=$reason")
        } catch (e: ApiException) {
            error = e.message
            return@launch
        }
        confirm = null
        onChanged()
        val rest = bottles.filter { it.id != selected.id }
        if (rest.isEmpty()) {
            onClose()
        } else {
            bottles = rest
            selectedId = rest[0].id
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        // Vintage and style, name, where it is from, drinking window.
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text = "${wine.vintage?.takeIf { it > 0 } ?: "NV"} · ${styleName(wine.color)}".uppercase(),
                style = AppType.overline,
                color = colors.muted,
            )
            Text(wine.name, style = AppType.display, color = colors.fg)
            val origin = listOfNotNull(wine.region, wine.country).filter { it.isNotBlank() }.joinToString(", ")
            Text(
                text = listOf(wine.producer, origin).filter { it.isNotBlank() }.joinToString(" · "),
                style = AppType.body,
                color = colors.muted,
            )
            Row(
                modifier = Modifier.padding(top = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                WindowBadge(selected.windowStatus)
                if (wine.drinkFrom != null && wine.drinkTo != null) {
                    Text("Best ${wine.drinkFrom}–${wine.drinkTo}", style = AppType.body, color = colors.fg2)
                }
            }
        }

        Column {
            Text("In your cellars · ${bottles.size}", style = AppType.title, color = colors.fg)
            val severalCellars = bottles.map { it.cellarId }.distinct().size > 1
            for (b in bottles) {
                LocationRow(
                    bottle = b,
                    on = b.id == selectedId,
                    showCellar = severalCellars || b.cellarId != bottle.cellarId,
                    onClick = {
                        selectedId = b.id
                        confirm = null
                    },
                )
            }
            Row(
                // Five buttons do not fit side by side on a phone, so this row can be swiped sideways.
                modifier = Modifier.padding(top = 14.dp)
                    .then(if (confirm == null) Modifier.horizontalScroll(rememberScrollState()) else Modifier),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                val asked = confirm
                if (asked == null) {
                    SecondaryButton("Find", onClick = { onFind(selected) })
                    SecondaryButton("Move", onClick = { onMove(selected) })
                    SecondaryButton("Edit", onClick = { onEdit(selected) })
                    SecondaryButton("Opened", onClick = { confirm = "consumed" })
                    SecondaryButton("Remove", onClick = { confirm = "removed" })
                } else {
                    Text(
                        text = if (asked == "consumed") "Mark this bottle as opened?" else "Remove this bottle from the inventory?",
                        style = AppType.body,
                        color = colors.fg2,
                        modifier = Modifier.weight(1f),
                    )
                    SecondaryButton(if (asked == "consumed") "Opened" else "Remove", onClick = { remove(asked) }, danger = true)
                    SecondaryButton("Cancel", onClick = { confirm = null })
                }
            }
            error?.let { Text(it, style = AppType.caption, color = colors.danger, modifier = Modifier.padding(top = 8.dp)) }
        }

        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("At a glance", style = AppType.title, color = colors.fg)
            Column(
                modifier = Modifier.fillMaxWidth().background(colors.surface, RoundedCornerShape(14.dp)).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Fact("Grape", wine.grape.orEmpty().ifBlank { "—" }, Modifier.weight(1f))
                    Fact("Region", wine.region.orEmpty().ifBlank { "—" }, Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    val change = selected.market.change12m
                    Fact(
                        label = "Value",
                        value = money(selected.market.price),
                        modifier = Modifier.weight(1f),
                        extra = "${percent(change)} this year",
                        extraColor = if (change >= 0) colors.ok else colors.danger,
                    )
                    Fact(
                        label = "Its shelf now",
                        value = shelf?.let { "%.1f °C · %d %%".format(it.temp, it.hum.roundToInt()) } ?: "No reading",
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }

        Column {
        Fold(
            title = "Sommeliers",
            summary = "What the sommeliers say about this wine",
            open = debateOpen,
            onToggle = { debateOpen = !debateOpen },
        ) {
            if (turns.isEmpty()) Text("The sommeliers are tasting…", style = AppType.body, color = colors.muted)
            for ((persona, message) in turns) SommelierMessage(persona, message, onPick = { })
            SecondaryButton("Ask the sommeliers", onClick = { onAsk(selected) })
        }
        Fold(
            title = "Food pairing",
            summary = "Dishes and recipes for this wine",
            open = pairingOpen,
            onToggle = { pairingOpen = !pairingOpen },
        ) {
            Text(pairing.ifEmpty { "Thinking…" }, style = AppType.body, color = colors.fg2)
        }
        Fold(
            title = "Price history",
            summary = "${money(selected.market.price)} today",
            open = priceOpen,
            onToggle = { priceOpen = !priceOpen },
        ) {
            val history = prices
            when {
                history == null -> Text("Loading…", style = AppType.body, color = colors.muted)
                history.size < 2 -> Text("No price history yet.", style = AppType.body, color = colors.muted)
                else -> {
                    LineChart(history.map { it.price }, Modifier.fillMaxWidth().height(140.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(history.first().date, style = AppType.caption, color = colors.muted)
                        Text(history.last().date, style = AppType.caption, color = colors.muted)
                    }
                    Text(
                        text = "Last 24 months" + if (selected.market.source == "simulated") " · simulated prices" else "",
                        style = AppType.caption,
                        color = colors.muted,
                    )
                }
            }
        }
        }
    }
}

/** One bottle of the wine: a radio mark, where it lies, and anything unusual about its position. */
@Composable
private fun LocationRow(bottle: Bottle, on: Boolean, showCellar: Boolean, onClick: () -> Unit) {
    val colors = AppTheme.colors
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).heightIn(min = 60.dp).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier.size(18.dp).border(1.dp, if (on) colors.accent else colors.muted, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (on) Box(Modifier.size(8.dp).background(colors.accent, CircleShape))
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = bottle.location.replace(Regex(" · (front|back)$"), ""),
                style = AppType.bodyStrong,
                color = colors.fg,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val notes = listOfNotNull(
                bottle.cellarName.takeIf { showCellar },
                "stacked, level ${bottle.level}".takeIf { bottle.level > 0 },
                "back row".takeIf { bottle.layer == "back" },
                "position uncertain".takeIf { bottle.source == "vision" && (bottle.confidence ?: 1.0) < 0.8 },
            )
            Text(notes.joinToString(" · ").ifEmpty { "Front row" }, style = AppType.caption, color = colors.muted)
        }
    }
    Box(Modifier.fillMaxWidth().height(1.dp).background(colors.hairline))
}

@Composable
private fun Fact(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    extra: String? = null,
    extraColor: Color = AppTheme.colors.muted,
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label.uppercase(), style = AppType.overline, color = AppTheme.colors.muted)
        Text(value, style = AppType.heading, color = AppTheme.colors.fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (extra != null) Text(extra, style = AppType.caption, color = extraColor)
    }
}

/** A section that stays folded to one line until tapped. */
@Composable
private fun Fold(title: String, summary: String, open: Boolean, onToggle: () -> Unit, content: @Composable () -> Unit) {
    val colors = AppTheme.colors
    Column {
        Box(Modifier.fillMaxWidth().height(1.dp).background(colors.hairline))
        Row(
            modifier = Modifier.fillMaxWidth().clickable(onClick = onToggle).heightIn(min = 64.dp).padding(vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(title, style = AppType.heading, color = colors.fg)
                if (!open) Text(summary, style = AppType.body, color = colors.muted)
            }
            Icon(
                imageVector = AppIcons.Chevron,
                contentDescription = null,
                tint = colors.muted,
                modifier = Modifier.size(20.dp).rotate(if (open) -90f else 90f),
            )
        }
        if (open) {
            Column(modifier = Modifier.padding(bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                content()
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(colors.hairline))
    }
}
