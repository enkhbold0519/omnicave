package com.example.omnicave.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.omnicave.data.Api
import com.example.omnicave.data.ApiException
import com.example.omnicave.data.LegalInfo
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType

/** The consent list and policy texts from the server (GET /api/legal), and an error if they could not be loaded. */
@Composable
fun rememberLegal(): Pair<LegalInfo?, String?> {
    var legal by remember { mutableStateOf<LegalInfo?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        try {
            legal = Api.get<LegalInfo>("/api/legal")
        } catch (e: ApiException) {
            error = e.message
        }
    }
    return legal to error
}

/** True when every required consent is ticked. */
fun requiredAccepted(legal: LegalInfo, value: Map<String, Boolean>) = legal.consents.all { !it.required || value[it.key] == true }

/**
 * Sign-up consents (PIPA): required and optional items are separate, and each policy can be read in full.
 * Summaries are shown for the personal-data items, where PIPA asks for purpose and retention up front.
 * Same layout as the display.
 */
@Composable
fun ConsentList(legal: LegalInfo, value: Map<String, Boolean>, onChange: (Map<String, Boolean>) -> Unit) {
    val colors = AppTheme.colors
    var doc by remember { mutableStateOf<String?>(null) }
    val all = legal.consents.all { value[it.key] == true }
    Column(
        modifier = Modifier.fillMaxWidth().background(colors.surface, RoundedCornerShape(12.dp)).padding(horizontal = 14.dp, vertical = 4.dp),
    ) {
        ConsentRow(checked = all, onClick = { onChange(legal.consents.associate { it.key to !all }) }) {
            Text("Agree to all", style = AppType.heading, color = colors.fg)
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(colors.hairline))
        for (c in legal.consents) {
            val on = value[c.key] == true
            ConsentRow(checked = on, onClick = { onChange(value + (c.key to !on)) }, onView = c.document?.let { d -> { doc = d } }) {
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(color = if (c.required) colors.accent else colors.muted, fontSize = 10.5.sp, letterSpacing = 1.2.sp, fontWeight = FontWeight.Medium)) {
                            append(if (c.required) "REQUIRED  " else "OPTIONAL  ")
                        }
                        append(c.title)
                    },
                    style = AppType.bodyStrong,
                    color = colors.fg,
                )
                if (c.key == "privacy" || c.key == "overseas") Text(c.summary, style = AppType.caption, color = colors.muted)
            }
        }
    }
    doc?.let { d -> PolicyDialog(if (d == "terms") "Terms of Service" else "Privacy Policy", legal.documents[d].orEmpty()) { doc = null } }
}

@Composable
private fun ConsentRow(checked: Boolean, onClick: () -> Unit, onView: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val colors = AppTheme.colors
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Row(
            modifier = Modifier.weight(1f).clickable(role = Role.Checkbox, onClick = onClick).padding(vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            CheckCircle(checked)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp), content = content)
        }
        if (onView != null) {
            Text("View ›", style = AppType.caption, color = colors.muted, modifier = Modifier.clickable(onClick = onView).padding(start = 8.dp, top = 14.dp, bottom = 8.dp))
        }
    }
}

/** A round checkbox: an empty ring, or filled with a tick. */
@Composable
fun CheckCircle(checked: Boolean) {
    val colors = AppTheme.colors
    Box(
        modifier = Modifier.size(22.dp).then(
            if (checked) Modifier.background(colors.accent, CircleShape) else Modifier.border(1.5.dp, colors.muted, CircleShape),
        ),
        contentAlignment = Alignment.Center,
    ) {
        if (checked) Text("✓", style = AppType.caption.copy(fontWeight = FontWeight.Bold), color = colors.onAccent)
    }
}

/** A policy text in a large dialog. */
@Composable
fun PolicyDialog(title: String, markdown: String, onClose: () -> Unit) {
    val colors = AppTheme.colors
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            modifier = Modifier.fillMaxWidth().fillMaxHeight(0.85f).padding(horizontal = 16.dp)
                .background(colors.surface, RoundedCornerShape(16.dp)).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, style = AppType.title, color = colors.fg, modifier = Modifier.weight(1f))
                Icon(AppIcons.Close, contentDescription = "Close", tint = colors.muted, modifier = Modifier.size(40.dp).clickable(onClick = onClose).padding(8.dp))
            }
            Column(modifier = Modifier.verticalScroll(rememberScrollState())) { PolicyText(markdown) }
        }
    }
}

private val LIST_ITEM = Regex("^(\\d+\\.|-) ")

/** Bold (**text**) inside a line. */
private fun rich(s: String): AnnotatedString = buildAnnotatedString {
    s.split("**").forEachIndexed { i, part -> if (i % 2 == 1) withStyle(SpanStyle(fontWeight = FontWeight.Medium)) { append(part) } else append(part) }
}

private fun cells(row: String) = row.trim().removePrefix("|").removeSuffix("|").split("|").map { it.trim() }

/** The small subset of Markdown the policy files use: ## headings, paragraphs, numbered lists, **bold** and tables.
 *  The file's own "# Title" is skipped, because the dialog shows the title. */
@Composable
fun PolicyText(markdown: String) {
    val colors = AppTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        for (block in markdown.split(Regex("\\n\\s*\\n"))) {
            val lines = block.lines().filter { it.isNotBlank() }
            val first = lines.firstOrNull() ?: continue
            when {
                first.startsWith("# ") -> Unit
                first.startsWith("## ") -> Text(first.removePrefix("## "), style = AppType.heading, color = colors.fg, modifier = Modifier.padding(top = 6.dp))
                first.startsWith("|") -> Column {
                    // header, separator line, rows
                    lines.filterIndexed { i, _ -> i != 1 }.forEachIndexed { i, row ->
                        Row(modifier = Modifier.padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            for (cell in cells(row)) {
                                Text(rich(cell), style = if (i == 0) AppType.overline else AppType.caption, color = if (i == 0) colors.muted else colors.fg2, modifier = Modifier.weight(1f))
                            }
                        }
                        Box(Modifier.fillMaxWidth().height(1.dp).background(colors.hairline))
                    }
                }
                LIST_ITEM.containsMatchIn(first) -> {
                    // an indented line continues the item above it
                    val items = mutableListOf<String>()
                    for (l in lines) if (LIST_ITEM.containsMatchIn(l)) items += l.replace(LIST_ITEM, "") else items[items.lastIndex] += " " + l.trim()
                    items.forEachIndexed { i, t -> Text(rich("${i + 1}. $t"), style = AppType.caption, color = colors.fg2) }
                }
                else -> Text(rich(lines.joinToString(" ") { it.trim() }), style = AppType.caption, color = colors.fg2)
            }
        }
    }
}
