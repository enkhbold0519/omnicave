package com.example.omnicave.ui.theme

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * The app's colours. Same names as the webOS display (styles.css),
 * so a screen here can be compared with the display colour by colour.
 */
data class AppColors(
    val isDark: Boolean,
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

/** Builds one look from the eleven colours that differ between palettes; the status colours are shared. */
private fun look(dark: Boolean, c: List<Long>) = AppColors(
    isDark = dark,
    background = Color(c[0]), surface = Color(c[1]), surfaceMuted = Color(c[2]), hairline = Color(c[3]),
    fg = Color(c[4]), fg2 = Color(c[5]), muted = Color(c[6]), onAccent = Color(c[7]),
    accent = Color(c[8]), accentPressed = Color(c[9]), accentSoft = Color(c[10]),
    // "warning" and "offline" look the same in every palette
    ok = Color(if (dark) 0xFF83B79A else 0xFF3D6B52),
    warn = Color(if (dark) 0xFFD9AA5E else 0xFF7D550F),
    warnSoft = Color(if (dark) 0xFF2A2418 else 0xFFF7EFDD),
    danger = Color(if (dark) 0xFFE38E84 else 0xFF9C3B33),
    dangerSoft = Color(if (dark) 0xFF2D1D1B else 0xFFF7E6E3),
    glow = Color(if (dark) 0xFFE9D8B0 else c[8]),
)

/**
 * The colour families of Profile → Appearance. The dark looks are the display's (on black),
 * the light ones come from the first Android app.
 */
enum class Palette(val label: String, val description: String, light: List<Long>, dark: List<Long>) {
    Forest(
        "Forest", "Cellar green",
        listOf(0xFFF6F3EC, 0xFFFBFAF6, 0xFFEFEBE1, 0xFFE2DDD1, 0xFF1C2420, 0xFF474F4A, 0xFF636863, 0xFFFBFAF6, 0xFF23443A, 0xFF1A332B, 0xFFE7EDE8),
        listOf(0xFF000000, 0xFF181D1A, 0xFF212723, 0xFF2A312D, 0xFFECE7DC, 0xFFC9CBC4, 0xFFA3A79F, 0xFF111513, 0xFF9DC2AD, 0xFF86AD97, 0xFF1E2A24),
    ),
    Bordeaux(
        "Bordeaux", "Deep wine",
        listOf(0xFFF7F2EE, 0xFFFCF9F6, 0xFFF0E8E2, 0xFFE6DBD3, 0xFF241A1C, 0xFF524649, 0xFF6D6366, 0xFFFCF9F6, 0xFF6E2433, 0xFF561B28, 0xFFF1E3E5),
        listOf(0xFF000000, 0xFF1D1719, 0xFF272023, 0xFF33292C, 0xFFEFE6E2, 0xFFCDC3C1, 0xFFA99D9C, 0xFF151112, 0xFFE0A3AE, 0xFFCC8C98, 0xFF2C1D21),
    ),
    Oak(
        "Oak", "Tobacco brown",
        listOf(0xFFF6F1E8, 0xFFFBF8F2, 0xFFEEE6D8, 0xFFE2D8C6, 0xFF231D16, 0xFF504637, 0xFF6A6154, 0xFFFBF8F2, 0xFF6F4A20, 0xFF583A18, 0xFFF1E7D8),
        listOf(0xFF000000, 0xFF1C1813, 0xFF26211A, 0xFF322B22, 0xFFEEE6D8, 0xFFCCC3B5, 0xFFA69C8E, 0xFF14110D, 0xFFD9B07A, 0xFFC49A64, 0xFF2B2319),
    ),
    Slate(
        "Slate", "Ink blue",
        listOf(0xFFF3F4F2, 0xFFFAFAF9, 0xFFE9EBE8, 0xFFDCDFDB, 0xFF1A1F24, 0xFF454E56, 0xFF60676E, 0xFFFAFAF9, 0xFF2D4356, 0xFF223444, 0xFFE3E9EE),
        listOf(0xFF000000, 0xFF171B20, 0xFF20252B, 0xFF2A3037, 0xFFE6E9EC, 0xFFC3C8CD, 0xFF9CA3AA, 0xFF101317, 0xFFA6BED3, 0xFF8FA9C0, 0xFF1C252E),
    );

    val light = look(false, light)
    val dark = look(true, dark)
}

/** What the user chose in Profile → Appearance. Kept on the phone and read by [OmniCaveTheme]. */
object Appearance {
    /** "system" (follow the phone), "light" or "dark". */
    var mode by mutableStateOf("system")
        private set
    var palette by mutableStateOf(Palette.Forest)
        private set
    private var prefs: SharedPreferences? = null

    fun load(context: Context) {
        val saved = context.getSharedPreferences("appearance", Context.MODE_PRIVATE)
        prefs = saved
        mode = saved.getString("mode", null) ?: "system"
        palette = Palette.entries.firstOrNull { it.name == saved.getString("palette", null) } ?: Palette.Forest
    }

    fun choose(mode: String = this.mode, palette: Palette = this.palette) {
        this.mode = mode
        this.palette = palette
        prefs?.edit()?.putString("mode", mode)?.putString("palette", palette.name)?.apply()
    }
}

val LocalAppColors = staticCompositionLocalOf { Palette.Forest.dark }

/** The colour that stands for a wine style ("red", "white", "rose", "sparkling"), as on the display. */
fun wineTint(style: String): Color = when (style) {
    "white" -> Color(0xFFC7B57A)
    "rose" -> Color(0xFFCE998F)
    "sparkling" -> Color(0xFFB4A57A)
    else -> Color(0xFF7A3340)
}
