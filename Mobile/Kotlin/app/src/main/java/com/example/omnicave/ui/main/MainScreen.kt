package com.example.omnicave.ui.main

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.omnicave.data.Api
import com.example.omnicave.data.ApiException
import com.example.omnicave.data.NotificationList
import com.example.omnicave.data.User
import com.example.omnicave.data.initials
import com.example.omnicave.ui.components.AppIcons
import com.example.omnicave.ui.profile.ProfileScreen
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType

/** The five main pages, same as the display. Profile opens from the avatar, not from the tab bar. */
enum class MainTab(val label: String, val icon: ImageVector) {
    Cellar("Cellar", AppIcons.Cellar),
    Inventory("Inventory", AppIcons.Inventory),
    Sommelier("Sommelier", AppIcons.Sommelier),
    Briefing("Briefing", AppIcons.Briefing),
    Value("Value", AppIcons.Value),
}

/**
 * The frame around every page once the user is logged in:
 * a top bar (page title, bell, avatar), the page itself, and the tab bar.
 */
@Composable
fun MainScreen(user: User, onLogout: () -> Unit, modifier: Modifier = Modifier) {
    // rememberSaveable keeps the open page when the phone is rotated.
    var tab by rememberSaveable { mutableStateOf(MainTab.Cellar) }
    var profileOpen by rememberSaveable { mutableStateOf(false) }
    var unread by remember { mutableIntStateOf(0) }

    // Refresh the bell's number on start and whenever the user changes page.
    LaunchedEffect(tab, profileOpen) {
        try {
            unread = Api.get<NotificationList>("/api/notifications").unread
        } catch (e: ApiException) {
            // keep the last number
        }
    }

    // The phone's Back button closes Profile. On a tab it leaves the app, as usual.
    BackHandler(enabled = profileOpen) { profileOpen = false }

    Column(modifier = modifier.fillMaxSize()) {
        TopBar(
            title = if (profileOpen) "Profile" else tab.label,
            user = user,
            unread = unread,
            profileOpen = profileOpen,
            onBack = { profileOpen = false },
            onProfile = { profileOpen = !profileOpen },
        )
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            if (profileOpen) {
                ProfileScreen(user = user, onLogout = onLogout)
            } else {
                ComingSoon(tab)
            }
        }
        TabBar(
            selected = if (profileOpen) null else tab,
            onSelect = {
                tab = it
                profileOpen = false
            },
        )
    }
}

@Composable
private fun TopBar(
    title: String,
    user: User,
    unread: Int,
    profileOpen: Boolean,
    onBack: () -> Unit,
    onProfile: () -> Unit,
) {
    val colors = AppTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(64.dp)
            .padding(start = if (profileOpen) 8.dp else 20.dp, end = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (profileOpen) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button, onClickLabel = "Back", onClick = onBack),
                contentAlignment = Alignment.Center,
            ) {
                Icon(AppIcons.Back, contentDescription = "Back", tint = colors.fg, modifier = Modifier.size(24.dp))
            }
        }
        Text(
            text = title,
            style = AppType.headline,
            color = colors.fg,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Bell(unread)
        Avatar(user = user, on = profileOpen, onClick = onProfile)
    }
}

/** Shows how many notifications are unread. Opening the list comes in a later step. */
@Composable
private fun Bell(unread: Int) {
    val colors = AppTheme.colors
    val description = if (unread > 0) "Notifications, $unread unread" else "Notifications"
    Box(
        modifier = Modifier
            .size(48.dp)
            .clearAndSetSemantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(AppIcons.Bell, contentDescription = null, tint = colors.fg2, modifier = Modifier.size(24.dp))
        if (unread > 0) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 6.dp, end = 4.dp)
                    .defaultMinSize(minWidth = 16.dp, minHeight = 16.dp)
                    .background(colors.accent, CircleShape)
                    .padding(horizontal = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = if (unread > 9) "9+" else unread.toString(),
                    style = AppType.caption.copy(fontSize = 10.sp, lineHeight = 12.sp, fontWeight = FontWeight.SemiBold),
                    color = colors.onAccent,
                )
            }
        }
    }
}

/** The round button with the user's initials. Opens Profile; tapping it again closes it. */
@Composable
private fun Avatar(user: User, on: Boolean, onClick: () -> Unit) {
    val colors = AppTheme.colors
    Box(
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = "Profile, signed in as ${user.username}" },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .background(colors.accentSoft, CircleShape)
                .border(1.dp, if (on) colors.accent else Color.Transparent, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = user.initials,
                style = AppType.bodyStrong,
                color = colors.accent,
                modifier = Modifier.clearAndSetSemantics { },
            )
        }
    }
}

/** The five tabs along the bottom. [selected] is null while Profile is open. */
@Composable
private fun TabBar(selected: MainTab?, onSelect: (MainTab) -> Unit) {
    val colors = AppTheme.colors
    Column {
        Box(modifier = Modifier.fillMaxWidth().height(1.dp).background(colors.hairline))
        Row(modifier = Modifier.fillMaxWidth().height(64.dp).selectableGroup()) {
            for (tab in MainTab.entries) {
                val isOn = tab == selected
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .selectable(selected = isOn, role = Role.Tab, onClick = { onSelect(tab) }),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
                ) {
                    Icon(
                        imageVector = tab.icon,
                        contentDescription = null,
                        tint = if (isOn) colors.accent else colors.muted,
                        modifier = Modifier.size(24.dp),
                    )
                    Text(
                        text = tab.label,
                        style = AppType.caption.copy(fontSize = 11.sp),
                        color = if (isOn) colors.fg else colors.muted,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

/** Stands in for a page that is built in a later step. */
@Composable
private fun ComingSoon(tab: MainTab) {
    val colors = AppTheme.colors
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        Icon(tab.icon, contentDescription = null, tint = colors.muted, modifier = Modifier.size(40.dp))
        Text("${tab.label} is coming soon", style = AppType.body, color = colors.muted)
    }
}
