package com.example.omnicave.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType

/** Corner radius shared by fields and buttons (the display's "medium" radius). */
val ControlShape = RoundedCornerShape(10.dp)

/** A text box with a small uppercase label above it, as on the display. */
@Composable
fun AppTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String = label,
    isPassword: Boolean = false,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
) {
    val colors = AppTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(text = label.uppercase(), style = AppType.overline, color = colors.muted)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            textStyle = AppType.body.copy(color = colors.fg),
            cursorBrush = SolidColor(colors.accent),
            visualTransformation = if (isPassword) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = keyboardOptions,
            keyboardActions = keyboardActions,
            interactionSource = interaction,
            modifier = Modifier.fillMaxWidth(),
            decorationBox = { innerTextField ->
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .background(colors.surface, ControlShape)
                        .border(1.dp, if (focused) colors.accent else colors.hairline, ControlShape)
                        .padding(horizontal = 14.dp),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (value.isEmpty()) {
                        Text(text = placeholder, style = AppType.body, color = colors.muted)
                    }
                    innerTextField()
                }
            },
        )
    }
}

/** The main action of a screen: a full-width accent button. */
@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = AppTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()

    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .alpha(if (enabled) 1f else 0.4f)
            .clip(ControlShape)
            .background(if (pressed) colors.accentPressed else colors.accent)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = text, style = AppType.heading, color = colors.onAccent)
    }
}

/** A quiet text-only button, for secondary actions like "Create an account". */
@Composable
fun LinkButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .heightIn(min = 48.dp)
            .clip(ControlShape)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = text, style = AppType.bodyStrong, color = AppTheme.colors.accent)
    }
}

/** One line of a checklist: an empty ring, or a filled tick once the rule is met. */
@Composable
fun Hint(label: String, ok: Boolean, modifier: Modifier = Modifier) {
    val colors = AppTheme.colors
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Canvas(
            modifier = Modifier
                .size(16.dp)
                .then(
                    if (ok) Modifier.background(colors.ok, CircleShape)
                    else Modifier.border(1.dp, colors.muted, CircleShape)
                ),
        ) {
            if (ok) {
                val u = size.minDimension / 16f
                val tick = Path().apply {
                    moveTo(4.5f * u, 8.4f * u)
                    lineTo(7f * u, 10.8f * u)
                    lineTo(11.5f * u, 5.6f * u)
                }
                drawPath(
                    path = tick,
                    color = colors.onAccent,
                    style = Stroke(width = 1.6f * u, cap = StrokeCap.Round, join = StrokeJoin.Round),
                )
            }
        }
        Text(text = label, style = AppType.caption, color = if (ok) colors.fg2 else colors.muted)
    }
}

/** The brand mark: a bottle end seen through the cellar door. Same drawing as the display's logo. */
@Composable
fun Logo(size: Dp, color: Color, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier.size(size)) {
        val u = this.size.minDimension / 100f // the drawing is defined on a 100×100 grid
        drawCircle(color = color, radius = 40f * u, style = Stroke(width = 6f * u))
        drawCircle(color = color.copy(alpha = 0.45f), radius = 28f * u, style = Stroke(width = 2f * u))
        drawCircle(color = color, radius = 12f * u)
        // the small highlight on the upper left of the glass
        drawArc(
            color = color.copy(alpha = 0.8f),
            startAngle = 211f,
            sweepAngle = 38f,
            useCenter = false,
            topLeft = Offset(center.x - 27f * u, center.y - 27f * u),
            size = Size(54f * u, 54f * u),
            style = Stroke(width = 4f * u, cap = StrokeCap.Round),
        )
    }
}
