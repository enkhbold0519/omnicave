package com.example.omnicave.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider

/** Read the app's colours anywhere with `AppTheme.colors`. */
object AppTheme {
    val colors: AppColors
        @Composable get() = LocalAppColors.current
}

/** Wraps the whole app in the palette and the light or dark mode chosen in Profile → Appearance. */
@Composable
fun OmniCaveTheme(content: @Composable () -> Unit) {
    val dark = Appearance.mode == "dark" || (Appearance.mode == "system" && isSystemInDarkTheme())
    val colors = if (dark) Appearance.palette.dark else Appearance.palette.light

    // Material components (spinner, dialogs, ripples) take their colours from here.
    val materialColors = (if (dark) darkColorScheme() else lightColorScheme()).copy(
        primary = colors.accent,
        onPrimary = colors.onAccent,
        secondary = colors.accent,
        onSecondary = colors.onAccent,
        background = colors.background,
        onBackground = colors.fg,
        surface = colors.background,
        onSurface = colors.fg,
        surfaceVariant = colors.surface,
        onSurfaceVariant = colors.muted,
        outline = colors.hairline,
        error = colors.danger,
        onError = colors.onAccent,
    )

    CompositionLocalProvider(LocalAppColors provides colors) {
        MaterialTheme(
            colorScheme = materialColors,
            typography = Typography,
            content = content,
        )
    }
}
