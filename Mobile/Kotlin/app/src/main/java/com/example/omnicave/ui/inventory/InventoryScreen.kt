package com.example.omnicave.ui.inventory

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.omnicave.data.Api
import com.example.omnicave.data.ApiException
import com.example.omnicave.data.Bottle
import com.example.omnicave.ui.components.AppTextField
import com.example.omnicave.ui.components.LinkButton
import com.example.omnicave.ui.components.Pill
import com.example.omnicave.ui.components.WindowBadge
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType
import com.example.omnicave.ui.theme.wineTint
import kotlinx.coroutines.delay
import java.net.URLEncoder

// Same filters, sorts and wording as the display's Inventory page.
private val STYLES = listOf("all" to "All", "red" to "Red", "white" to "White", "rose" to "Rosé", "sparkling" to "Sparkling")

/** One row of the list: a key for the wine, and its bottles. */
private typealias WineGroup = Pair<String, List<Bottle>>

private enum class Sort(val label: String) { Name("Name"), Vintage("Vintage"), Recent("Recently added") }

/** The bottles of one cellar as a list of wines, with search, filters and sorting. */
@Composable
fun InventoryScreen(cellarId: Int?, onOpen: (Bottle) -> Unit, modifier: Modifier = Modifier) {
    val colors = AppTheme.colors
    var query by rememberSaveable { mutableStateOf("") }
    var style by rememberSaveable { mutableStateOf("all") }
    var readyOnly by rememberSaveable { mutableStateOf(false) }
    var sort by rememberSaveable { mutableStateOf(Sort.Name) }

    var bottles by remember { mutableStateOf<List<Bottle>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    // The search runs on the server (name, winery, region, vintage, grape). Typing restarts this
    // block, so the request is only sent once the user has paused for a moment.
    LaunchedEffect(query, cellarId) {
        delay(200)
        val cellar = if (cellarId != null) "&cellar_id=$cellarId" else ""
        try {
            bottles = Api.get<List<Bottle>>("/api/bottles?q=" + URLEncoder.encode(query.trim(), "UTF-8") + cellar)
            error = null
        } catch (e: ApiException) {
            error = e.message
        }
        loaded = true
    }

    // Filter here, then put bottles of the same wine and vintage into one row.
    val wines = remember(bottles, style, readyOnly, sort) {
        bottles
            .filter { (style == "all" || it.wine.color == style) && (!readyOnly || it.windowStatus == "ready") }
            .groupBy { b -> b.wine.id?.let { "w$it" } ?: "${b.wine.producer}|${b.wine.name}|${b.wine.vintage}" }
            .toList()
            .sortedWith(
                when (sort) {
                    Sort.Name -> compareBy<WineGroup> { it.second[0].wine.name.lowercase() }
                    Sort.Vintage -> compareByDescending<WineGroup> { it.second[0].wine.vintage ?: 0 }
                    Sort.Recent -> compareByDescending<WineGroup> { group -> group.second.maxOf { it.addedAt } }
                }
            )
    }
    val bottleCount = wines.sumOf { it.second.size }
    val filtered = query.isNotBlank() || style != "all" || readyOnly

    Column(modifier = modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            text = "$bottleCount ${if (bottleCount == 1) "bottle" else "bottles"} · " +
                "${wines.size} ${if (wines.size == 1) "wine" else "wines"}",
            style = AppType.caption,
            color = colors.muted,
            modifier = Modifier.padding(horizontal = 20.dp),
        )
        AppTextField(
            value = query,
            onValueChange = { query = it },
            label = "",
            placeholder = "Wine, winery, region, vintage, grape",
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            modifier = Modifier.padding(horizontal = 20.dp),
        )
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            for ((key, label) in STYLES) {
                Pill(text = label, on = style == key, onClick = { style = key })
            }
            Pill(text = "Ready to drink", on = readyOnly, onClick = { readyOnly = !readyOnly })
            Pill(
                text = "Sort: ${sort.label}",
                on = false,
                onClick = { sort = Sort.entries[(sort.ordinal + 1) % Sort.entries.size] },
            )
        }

        if (loaded && wines.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 48.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                val failed = error
                when {
                    failed != null -> Text(failed, style = AppType.body, color = colors.muted)
                    filtered -> {
                        Text("No wines match", style = AppType.title, color = colors.fg)
                        LinkButton(
                            text = "Clear filters",
                            onClick = {
                                query = ""
                                style = "all"
                                readyOnly = false
                            },
                        )
                    }
                    else -> {
                        Text("No bottles yet", style = AppType.title, color = colors.fg)
                        Text("Add a bottle from the Cellar page.", style = AppType.body, color = colors.muted)
                    }
                }
            }
        } else {
            LazyColumn(modifier = Modifier.weight(1f).fillMaxWidth()) {
                items(wines, key = { it.first }) { (_, group) ->
                    WineRow(group, onClick = { onOpen(group[0]) })
                }
            }
        }
    }
}

/** Tint bar · vintage and style · name · producer and region · bottle count and drinking state. */
@Composable
private fun WineRow(bottles: List<Bottle>, onClick: () -> Unit) {
    val colors = AppTheme.colors
    val wine = bottles[0].wine
    val styleName = STYLES.firstOrNull { it.first == wine.color }?.second ?: wine.color
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 12.dp)
            .height(IntrinsicSize.Min),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.width(4.dp).fillMaxHeight().background(wineTint(wine.color), RoundedCornerShape(2.dp)))
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = "${wine.vintage?.takeIf { it > 0 } ?: "NV"} · $styleName".uppercase(),
                style = AppType.overline,
                color = colors.muted,
            )
            Text(wine.name, style = AppType.heading, color = colors.fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                text = listOfNotNull(wine.producer, wine.region).filter { it.isNotBlank() }.joinToString(" · "),
                style = AppType.caption,
                color = colors.muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(bottles.size.toString(), style = AppType.title, color = colors.fg)
            WindowBadge(bottles[0].windowStatus)
        }
    }
}
