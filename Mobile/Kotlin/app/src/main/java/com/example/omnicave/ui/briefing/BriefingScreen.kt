package com.example.omnicave.ui.briefing

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.omnicave.data.Api
import com.example.omnicave.data.ApiException
import com.example.omnicave.data.Bottle
import com.example.omnicave.data.EnvZone
import com.example.omnicave.data.Environment
import com.example.omnicave.data.MarketSummary
import com.example.omnicave.data.money
import com.example.omnicave.data.percent
import com.example.omnicave.data.vintageLabel
import com.example.omnicave.ui.components.AppIcons
import com.example.omnicave.ui.components.LineChart
import com.example.omnicave.ui.components.LinkButton
import com.example.omnicave.ui.components.SectionHead
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType
import com.example.omnicave.ui.theme.wineTint
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
private data class News(val title: String, val summary: String = "", val source: String = "", val matched: List<String> = emptyList())

/** Answer of GET /api/briefing. */
@Serializable
private data class Brief(val news: List<News> = emptyList(), @SerialName("news_is_sample") val newsIsSample: Boolean = false)

/** Answer of GET /api/recommendations/windows: bottles by where they are in their drinking window. */
@Serializable
private data class Windows(
    val ready: List<Bottle> = emptyList(),
    val approaching: List<Bottle> = emptyList(),
    @SerialName("past_peak") val pastPeak: List<Bottle> = emptyList(),
    val year: Int,
)

/** The daily briefing, readable at a glance: one sentence, three tiles, a few bottles, three headlines. */
@Composable
fun BriefingScreen(cellarId: Int?, onOpen: (Bottle) -> Unit, onValue: () -> Unit, modifier: Modifier = Modifier) {
    val colors = AppTheme.colors
    var windows by remember { mutableStateOf<Windows?>(null) }
    var brief by remember { mutableStateOf<Brief?>(null) }
    var market by remember { mutableStateOf<MarketSummary?>(null) }
    var zones by remember { mutableStateOf<List<EnvZone>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var openNews by remember { mutableStateOf<Int?>(null) }
    var allNews by remember { mutableStateOf(false) }

    LaunchedEffect(cellarId) {
        // The value line and the climate tile are extras: the page shows without them if they fail.
        launch {
            try {
                market = Api.get<MarketSummary>("/api/market/summary")
            } catch (e: ApiException) {
            }
        }
        launch {
            try {
                if (cellarId != null) zones = Api.get<Environment>("/api/cellars/$cellarId/environment?minutes=1440").zones
            } catch (e: ApiException) {
            }
        }
        try {
            windows = Api.get<Windows>("/api/recommendations/windows")
            brief = Api.get<Brief>("/api/briefing")
        } catch (e: ApiException) {
            error = e.message
        }
    }

    val win = windows
    if (win == null) {
        Box(modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
            Text(error ?: "Preparing your briefing…", style = AppType.body, color = if (error != null) colors.danger else colors.muted)
        }
        return
    }
    val year = win.year
    val ready = win.ready.size
    val (climate, climateColor) = when {
        zones.any { !it.sensorOnline } -> "Sensor offline" to colors.danger
        zones.any { !it.inRange } -> "Needs a look" to colors.warn
        else -> "All normal" to colors.ok
    }
    // Drink first what will not wait: past-peak bottles, then ready ones whose window closes soonest.
    val openSoon = (win.pastPeak + win.ready).take(3)

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            text = (if (ready == 0) "Nothing is at its peak yet" else if (ready == 1) "1 bottle is ready to drink" else "$ready bottles are ready to drink") +
                (if (win.pastPeak.isNotEmpty()) ", ${win.pastPeak.size} should be opened soon" else "") + ".",
            style = AppType.headline,
            color = colors.fg,
        )
        market?.let { m ->
            Row(
                modifier = Modifier.clickable(onClick = onValue).padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text("Collection ${money(m.total)}", style = AppType.bodyStrong, color = colors.fg)
                Text(percent(m.change12m), style = AppType.bodyStrong, color = if (m.change12m >= 0) colors.ok else colors.danger)
                Text("this year", style = AppType.body, color = colors.muted)
                Icon(AppIcons.Chevron, contentDescription = null, tint = colors.muted, modifier = Modifier.size(16.dp))
            }
        }

        Row(modifier = Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Tile("Ready now", Modifier.weight(1f)) {
                Row(modifier = Modifier.height(24.dp), horizontalArrangement = Arrangement.spacedBy((-6).dp)) {
                    for (b in win.ready.take(4)) {
                        Box(Modifier.size(24.dp).background(wineTint(b.wine.color), CircleShape).border(2.dp, colors.surface, CircleShape))
                    }
                }
                Text("$ready", style = AppType.display, color = colors.fg)
            }
            Tile("Next year", Modifier.weight(1f)) {
                Box(Modifier.height(24.dp), contentAlignment = Alignment.CenterStart) {
                    Text("in ${year + 1}", style = AppType.caption, color = colors.muted)
                }
                Text("${win.approaching.size}", style = AppType.display, color = colors.fg)
            }
            Tile("Climate · 24 h", Modifier.weight(1f)) {
                Row(modifier = Modifier.height(24.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    for (z in zones) {
                        LineChart(
                            values = z.history.map { it.temp },
                            modifier = Modifier.weight(1f).fillMaxHeight(),
                            color = if (!z.sensorOnline) colors.danger else if (!z.inRange) colors.warn else colors.ok,
                            band = z.tempMin to z.tempMax,
                        )
                    }
                }
                Text(climate, style = AppType.heading, color = climateColor)
            }
        }

        if (openSoon.isNotEmpty()) {
            SectionHead("Open soon", modifier = Modifier.padding(top = 6.dp))
            for (b in openSoon) {
                val past = b.windowStatus == "past-peak"
                val to = b.wine.drinkTo ?: year
                Row(
                    modifier = Modifier.fillMaxWidth().clickable { onOpen(b) }.padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(Modifier.width(4.dp).height(38.dp).background(wineTint(b.wine.color), RoundedCornerShape(2.dp)))
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("${b.wine.name} ${b.wine.vintageLabel}", style = AppType.bodyStrong, color = colors.fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        WindowBar(from = b.wine.drinkFrom ?: year, to = to, year = year)
                    }
                    Text(
                        text = if (past) "Past its best" else "until $to",
                        style = AppType.caption,
                        color = if (past) colors.danger else if (to <= year + 1) colors.warn else colors.muted,
                    )
                }
            }
        }

        val news = brief?.news.orEmpty()
        SectionHead("News for you", modifier = Modifier.padding(top = 6.dp))
        if (brief == null) {
            Text(error ?: "Loading the news…", style = AppType.caption, color = if (error != null) colors.danger else colors.muted)
        } else if (brief?.newsIsSample == true) {
            Text("Sample stories (offline)", style = AppType.caption, color = colors.muted)
        }
        Column {
            news.take(if (allNews) news.size else 3).forEachIndexed { i, n ->
                Column(
                    modifier = Modifier.fillMaxWidth().clickable { openNews = if (openNews == i) null else i }.padding(vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(n.title, style = AppType.bodyStrong, color = colors.fg)
                    Text((listOf(n.source) + n.matched.take(2)).joinToString(" · "), style = AppType.caption, color = colors.muted)
                    if (openNews == i && n.summary.isNotEmpty()) Text(n.summary, style = AppType.body, color = colors.fg2)
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(colors.hairline))
            }
        }
        if (news.size > 3) {
            LinkButton(if (allNews) "Show less" else "Show ${news.size - 3} more", onClick = { allNews = !allNews })
        }
    }
}

/** One of the three boxes under the headline: a small picture, the figure, and what it counts. */
@Composable
private fun Tile(label: String, modifier: Modifier, content: @Composable () -> Unit) {
    Column(
        modifier = modifier.fillMaxHeight().background(AppTheme.colors.surface, RoundedCornerShape(12.dp)).padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        content()
        Text(label.uppercase(), style = AppType.overline, color = AppTheme.colors.muted)
    }
}

/** The drinking window as a bar from the first to the last good year, with a dot for this year. */
@Composable
private fun WindowBar(from: Int, to: Int, year: Int) {
    val colors = AppTheme.colors
    val color = when {
        year > to -> colors.danger
        year >= to - 1 -> colors.warn
        year < from -> colors.muted
        else -> colors.ok
    }
    Canvas(Modifier.fillMaxWidth().height(10.dp)) {
        val low = minOf(from, year)
        val span = maxOf(1, maxOf(to, year) - low).toFloat()
        val r = 4.dp.toPx()
        fun x(y: Int) = r + (y - low) / span * (size.width - 2 * r)
        val mid = size.height / 2
        drawLine(colors.hairline, Offset(r, mid), Offset(size.width - r, mid), r, StrokeCap.Round)
        drawLine(color, Offset(x(from), mid), Offset(maxOf(x(to), x(from) + 1f), mid), r, StrokeCap.Round)
        drawCircle(colors.fg, r, Offset(x(year), mid))
    }
}
