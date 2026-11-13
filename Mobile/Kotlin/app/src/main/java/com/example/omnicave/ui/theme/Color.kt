package com.example.omnicave.ui.theme

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * The app's colours. Same names and values as the webOS display (styles.css, palette "Forest"),
 * so a screen here can be compared with the display colour by colour.
 */
data class AppColors(
    val background: Color,
    val surface: Color,
    val surfaceMuted: Color,
    val hairline: Color,
    val fg: Color,
    val fg2: Color,
    val muted: Color,
    val onAccent: Color,
    val accent: Color,
    val accentPressed: Color,
    val accentSoft: Color,
    val ok: Color,
    val warn: Color,
    val warnSoft: Color,
    val danger: Color,
    val dangerSoft: Color,
    /** The warm "interior light" colour, used for the logo. */
    val glow: Color,
)

val ForestColors = AppColors(
    background = Color(0xFF000000),
    surface = Color(0xFF181D1A),
    surfaceMuted = Color(0xFF212723),
    hairline = Color(0xFF2A312D),
    fg = Color(0xFFECE7DC),
    fg2 = Color(0xFFC9CBC4),
    muted = Color(0xFFA3A79F),
    onAccent = Color(0xFF111513),
    accent = Color(0xFF9DC2AD),
    accentPressed = Color(0xFF86AD97),
    accentSoft = Color(0xFF1E2A24),
    ok = Color(0xFF83B79A),
    warn = Color(0xFFD9AA5E),
    warnSoft = Color(0xFF2A2418),
    danger = Color(0xFFE38E84),
    dangerSoft = Color(0xFF2D1D1B),
    glow = Color(0xFFE9D8B0),
)

val LocalAppColors = staticCompositionLocalOf { ForestColors }
