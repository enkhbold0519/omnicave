package com.example.omnicave.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider

/** Read the app's colours anywhere with `AppTheme.colors`. */
object AppTheme {
    val colors: AppColors
        @Composable get() = LocalAppColors.current
}

/**
 * Wraps the whole app. Like the display, there is one dark look; it does not follow
 * the phone's light/dark setting or wallpaper colours.
 */
@Composable
fun OmniCaveTheme(content: @Composable () -> Unit) {
    val colors = ForestColors

    // Material components (spinner, dialogs, ripples) take their colours from here.
    val materialColors = darkColorScheme(
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
