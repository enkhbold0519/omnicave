package com.example.omnicave.ui.value

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.omnicave.data.Api
import com.example.omnicave.data.ApiException
import com.example.omnicave.data.Bottle
import com.example.omnicave.data.MarketSummary
import com.example.omnicave.data.ValueRow
import com.example.omnicave.data.money
import com.example.omnicave.data.percent
import com.example.omnicave.data.styleName
import com.example.omnicave.ui.components.LineChart
import com.example.omnicave.ui.components.LinkButton
import com.example.omnicave.ui.components.Pill
import com.example.omnicave.ui.components.SectionHead
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType
import com.example.omnicave.ui.theme.wineTint
import kotlinx.coroutines.launch

/** What the collection is worth: the total and its trend first, then what drives it. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ValueScreen(onOpen: (Bottle) -> Unit, modifier: Modifier = Modifier) {
    val colors = AppTheme.colors
    var summary by remember { mutableStateOf<MarketSummary?>(null) }
    // The summary has no wine style and cannot open a wine page; both come from the inventory.
    var bottles by remember { mutableStateOf<Map<Int, Bottle>>(emptyMap()) }
    var error by remember { mutableStateOf<String?>(null) }
    var months by remember { mutableIntStateOf(12) }
    var showAll by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        launch {
            try {
                bottles = Api.get<List<Bottle>>("/api/bottles?q=").associateBy { it.id }
            } catch (e: ApiException) {
            }
        }
        try {
            summary = Api.get<MarketSummary>("/api/market/summary")
        } catch (e: ApiException) {
            error = e.message
        }
    }

    val m = summary
    if (m == null) {
        Box(modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
            Text(error ?: "Loading market data…", style = AppType.body, color = if (error != null) colors.danger else colors.muted)
        }
        return
    }
    val rows = m.bottles
    val open = { row: ValueRow -> bottles[row.bottleId]?.let(onOpen) ?: Unit }
    val tint = { row: ValueRow -> bottles[row.bottleId]?.let { wineTint(it.wine.color) } ?: colors.hairline }
    val history = m.history.takeLast(months + 1) // monthly points: a year needs 13
    val change = if (history.size > 1 && history.first().value > 0) (history.last().value - history.first().value) / history.first().value * 100 else m.change12m
    val cellars = rows.map { it.cellar }.distinct().size
    val byStyle = listOf("red", "white", "rose", "sparkling")
        .map { style -> style to rows.filter { bottles[it.bottleId]?.wine?.color == style }.sumOf { it.price } }
        .filter { it.second > 0 }
    val up = rows.maxByOrNull { it.change12m }
    val down = rows.minByOrNull { it.change12m }

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("${m.count} bottles" + if (cellars > 1) " · $cellars cellars" else "", style = AppType.caption, color = colors.muted, modifier = Modifier.weight(1f))
            Pill("1 year", on = months == 12, onClick = { months = 12 })
            Pill("2 years", on = months == 24, onClick = { months = 24 })
        }
        Text(money(m.total), style = AppType.display, color = colors.fg)
        Text(
            "${percent(change)} in ${if (months == 12) "a year" else "two years"}",
            style = AppType.bodyStrong,
            color = if (change >= 0) colors.ok else colors.danger,
        )
        if (history.size > 1) {
            LineChart(history.map { it.value }, modifier = Modifier.fillMaxWidth().height(150.dp))
            Row {
                Text(history.first().date, style = AppType.caption, color = colors.muted, modifier = Modifier.weight(1f))
                Text(history.last().date, style = AppType.caption, color = colors.muted)
            }
        }

        if (byStyle.isNotEmpty()) {
            SectionHead("By style", modifier = Modifier.padding(top = 8.dp))
            Row(modifier = Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                for ((style, value) in byStyle) Box(Modifier.weight(value.toFloat()).fillMaxHeight().background(wineTint(style)))
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for ((style, value) in byStyle) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.size(8.dp).background(wineTint(style), CircleShape))
                        Text(styleName(style), style = AppType.caption, color = colors.muted)
                        Text(money(value), style = AppType.caption, color = colors.fg)
                    }
                }
            }
        }

        if (up != null && down != null && up.bottleId != down.bottleId) {
            SectionHead("This year", modifier = Modifier.padding(top = 8.dp))
            Row(modifier = Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                for ((title, row) in listOf("Rose most" to up, (if (down.change12m < 0) "Fell most" else "Rose least") to down)) {
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .clip(RoundedCornerShape(12.dp))
                            .background(colors.surface)
                            .clickable { open(row) }
                            .padding(12.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(title.uppercase(), style = AppType.overline, color = colors.muted)
                        Text(row.label, style = AppType.bodyStrong, color = colors.fg, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                        Text(percent(row.change12m), style = AppType.heading, color = if (row.change12m >= 0) colors.ok else colors.danger)
                    }
                }
            }
        }

        SectionHead("Most valuable", modifier = Modifier.padding(top = 8.dp))
        Column {
            for (row in if (showAll) rows else rows.take(5)) {
                Row(
                    modifier = Modifier.fillMaxWidth().clickable { open(row) }.padding(vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(Modifier.width(4.dp).height(36.dp).background(tint(row), RoundedCornerShape(2.dp)))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(row.label, style = AppType.bodyStrong, color = colors.fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (cellars > 1) Text(row.cellar, style = AppType.caption, color = colors.muted)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(money(row.price), style = AppType.bodyStrong, color = colors.fg)
                        Text(percent(row.change12m), style = AppType.caption, color = if (row.change12m >= 0) colors.ok else colors.danger)
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(colors.hairline))
            }
        }
        if (rows.size > 5) LinkButton(if (showAll) "Show fewer" else "Show all ${rows.size}", onClick = { showAll = !showAll })
        if (m.source == "simulated") Text("Prices are estimates, not live market data.", style = AppType.caption, color = colors.muted)
    }
}
