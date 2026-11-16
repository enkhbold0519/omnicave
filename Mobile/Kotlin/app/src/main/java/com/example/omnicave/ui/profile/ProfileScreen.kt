package com.example.omnicave.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.omnicave.data.User
import com.example.omnicave.data.initials
import com.example.omnicave.data.shownName
import com.example.omnicave.ui.components.LinkButton
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType

/** Who is signed in, and Log out. Settings are added here in a later step. */
@Composable
fun ProfileScreen(user: User, onLogout: () -> Unit, modifier: Modifier = Modifier) {
    val colors = AppTheme.colors
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            modifier = Modifier.size(88.dp).background(colors.accent, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = user.initials,
                style = AppType.display,
                color = colors.onAccent,
                modifier = Modifier.clearAndSetSemantics { },
            )
        }
        Spacer(Modifier.height(10.dp))
        Text(user.shownName, style = AppType.headline, color = colors.fg, textAlign = TextAlign.Center)
        Text("@${user.username}", style = AppType.body, color = colors.muted)
        Text(user.email, style = AppType.body, color = colors.muted)
        Spacer(Modifier.height(18.dp))
        LinkButton(text = "Log out", onClick = onLogout, color = colors.danger)
    }
}
