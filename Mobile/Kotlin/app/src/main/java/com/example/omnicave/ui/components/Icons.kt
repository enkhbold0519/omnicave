package com.example.omnicave.ui.components

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * The app's icons: thin outlines on a 24×24 grid, the same drawings as the display's Icon.tsx.
 * Show one with Material's `Icon(AppIcons.Bell, contentDescription = ..., tint = ...)`;
 * the tint replaces the placeholder colour used here.
 */
object AppIcons {
    val Cellar = outline(
        "Cellar",
        "M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2H6a2 2 0 0 1 -2 -2V5a2 2 0 0 1 2 -2z",
        "M4 9h16M4 15h16",
        dot(8.5f, 6f), dot(12f, 6f), dot(8.5f, 12f), dot(15.5f, 18f),
    )
    val Inventory = outline(
        "Inventory",
        "M7.5 3h9l0.5 4.5a5 5 0 0 1 -10 0z",
        "M12 12.5V20M8.5 20.5h7",
    )
    val Sommelier = outline(
        "Sommelier",
        "M10 3.5l1.6 4.4L16 9.5l-4.4 1.6L10 15.5l-1.6 -4.4L4 9.5l4.4 -1.6z",
        "M17.5 13.5l0.8 2.2 2.2 0.8 -2.2 0.8 -0.8 2.2 -0.8 -2.2 -2.2 -0.8 2.2 -0.8z",
    )
    val Briefing = outline(
        "Briefing",
        "M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0",
        "M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4 -1.4M17.3 6.7l1.4 -1.4",
    )
    val Value = outline(
        "Value",
        "M3 17l6 -6 4 4 8 -8",
        "M15 7h6v6",
    )
    val Bell = outline(
        "Bell",
        "M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z",
        "M10 20.5a2 2 0 0 0 4 0",
    )
    val Back = outline("Back", "M15 5l-7 7 7 7")
    val Chevron = outline("Chevron", "M9 5l7 7 -7 7")
    val Close = outline("Close", "M6 6l12 12M18 6L6 18")
}

/** A small ring of radius 0.9 around (cx, cy), written as a path. */
private fun dot(cx: Float, cy: Float): String =
    "M${cx - 0.9f} ${cy}a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0"

/** Builds one icon from SVG path strings, drawn as 1.5-wide rounded strokes with no fill. */
private fun outline(name: String, vararg paths: String): ImageVector {
    val builder = ImageVector.Builder(
        name = name,
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    )
    for (path in paths) {
        builder.addPath(
            pathData = addPathNodes(path),
            stroke = SolidColor(Color.Black),
            strokeLineWidth = 1.5f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        )
    }
    return builder.build()
}
