package com.example.omnicave.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.example.omnicave.R

val Montserrat = FontFamily(
    Font(R.font.montserrat_light, FontWeight.Light),
    Font(R.font.montserrat_regular, FontWeight.Normal),
    Font(R.font.montserrat_medium, FontWeight.Medium),
    Font(R.font.montserrat_semibold, FontWeight.SemiBold),
)

private fun style(weight: FontWeight, size: Double, lineHeight: Int, tracking: Double) = TextStyle(
    fontFamily = Montserrat,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = lineHeight.sp,
    letterSpacing = tracking.sp,
)

/**
 * The text styles. Same roles as the display (hero … overline), at phone sizes:
 * light weight for large text, medium for emphasis.
 */
object AppType {
    val hero = style(FontWeight.Light, 44.0, 50, -1.4)
    val display = style(FontWeight.Light, 30.0, 36, -0.6)
    val headline = style(FontWeight.Light, 23.0, 29, -0.4)
    val title = style(FontWeight.Normal, 20.0, 26, -0.3)
    val heading = style(FontWeight.Medium, 15.0, 21, -0.1)
    val body = style(FontWeight.Normal, 14.0, 22, 0.0)
    val bodyStrong = style(FontWeight.Medium, 14.0, 20, 0.0)
    val caption = style(FontWeight.Normal, 12.0, 17, 0.1)

    /** Small tracked label. Callers pass the text already in UPPERCASE. */
    val overline = style(FontWeight.Medium, 10.5, 14, 1.6)
}

/** Lets ready-made Material components (dialogs, menus) use the same font and sizes. */
val Typography = Typography(
    displaySmall = AppType.hero,
    headlineLarge = AppType.display,
    headlineMedium = AppType.display,
    headlineSmall = AppType.headline,
    titleLarge = AppType.title,
    titleMedium = AppType.heading,
    titleSmall = AppType.bodyStrong,
    bodyLarge = AppType.body,
    bodyMedium = AppType.body,
    bodySmall = AppType.caption,
    labelLarge = AppType.bodyStrong,
    labelMedium = AppType.caption,
    labelSmall = AppType.overline,
)
