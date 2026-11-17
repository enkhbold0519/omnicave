package com.example.omnicave.ui.main

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
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
import com.example.omnicave.data.Bottle
import com.example.omnicave.data.CellarSummary
import com.example.omnicave.data.Notification
import com.example.omnicave.data.NotificationList
import com.example.omnicave.data.User
import com.example.omnicave.data.initials
import com.example.omnicave.data.shownName
import com.example.omnicave.ui.briefing.BriefingScreen
import com.example.omnicave.ui.cellar.CellarScreen
import com.example.omnicave.ui.components.AppIcons
import com.example.omnicave.ui.components.LinkButton
import com.example.omnicave.ui.inventory.InventoryScreen
import com.example.omnicave.ui.profile.PROFILE_PAGES
import com.example.omnicave.ui.profile.ProfileScreen
import com.example.omnicave.ui.sommelier.SommelierScreen
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.value.ValueScreen
import com.example.omnicave.ui.wine.BottleFormScreen
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import com.example.omnicave.ui.wine.WineDetailsScreen
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
fun MainScreen(user: User, onUser: (User) -> Unit, onLogout: () -> Unit, modifier: Modifier = Modifier) {
    val scope = rememberCoroutineScope()
    // rememberSaveable keeps the open page when the phone is rotated.
    var tab by rememberSaveable { mutableStateOf(MainTab.Cellar) }
    var profileOpen by rememberSaveable { mutableStateOf(false) }
    // The settings page open inside Profile (a key of PROFILE_PAGES), or null for Profile itself.
    var profilePage by rememberSaveable { mutableStateOf<String?>(null) }
    val profileBack = {
        if (profilePage != null) profilePage = null else profileOpen = false
        Unit
    }
    var notifications by remember { mutableStateOf(NotificationList()) }
    var notificationsOpen by remember { mutableStateOf(false) }
    var cellarLoads by remember { mutableIntStateOf(0) }
    var cellars by remember { mutableStateOf<List<CellarSummary>>(emptyList()) }
    var cellarId by rememberSaveable { mutableStateOf<Int?>(null) }
    // The wine whose details page is open over the current tab, if any.
    var detail by remember { mutableStateOf<Bottle?>(null) }
    // The add/edit form, drawn over everything else: adding a new bottle, or editing this one.
    var adding by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Bottle?>(null) }
    val formOpen = adding || editing != null
    val closeForm = {
        adding = false
        editing = null
    }
    // On the cellar map: the bottle ringed after Find, and the bottle waiting for its new spot after Move.
    var highlight by remember { mutableStateOf<Int?>(null) }
    var moving by remember { mutableStateOf<Bottle?>(null) }
    val showOnMap = { b: Bottle, move: Boolean ->
        cellarId = b.cellarId
        tab = MainTab.Cellar
        detail = null
        highlight = b.id
        moving = if (move) b else null
    }
    // The ring fades after a few seconds.
    LaunchedEffect(highlight, moving) {
        if (highlight != null && moving == null) {
            delay(8000)
            highlight = null
        }
    }
    // Set by "Ask the sommeliers" on a wine page; the Sommelier tab then opens a tasting for it.
    var askWine by remember { mutableStateOf<Bottle?>(null) }
    // Counts changes to bottles; pages reload their lists when it goes up.
    var changes by remember { mutableIntStateOf(0) }
    // Remembers each page's own state (search text, filters) while another tab is open.
    val pages = rememberSaveableStateHolder()

    // Load the user's cellars (again after a change in settings) and start with the first one.
    LaunchedEffect(cellarLoads) {
        try {
            cellars = Api.get<List<CellarSummary>>("/api/cellars")
            if (cellars.none { it.id == cellarId }) cellarId = cellars.firstOrNull()?.id
        } catch (e: ApiException) {
            // pages then show all bottles
        }
    }

    // Live updates: a change made anywhere (door display, another phone, the cellar) reloads the pages at once.
    // The connection is reopened after 5 seconds if it drops; the pages' own refresh timers cover the gap.
    LaunchedEffect(Unit) {
        while (true) {
            val closed = CompletableDeferred<Unit>()
            val socket = Api.listen(onChange = { changes++ }, onClosed = { closed.complete(Unit) })
            try {
                closed.await()
            } finally {
                socket.cancel()
            }
            delay(5_000)
        }
    }

    // Refresh the bell's number on start, whenever the user changes page, and after a live update.
    LaunchedEffect(tab, profileOpen, changes) {
        try {
            notifications = Api.get<NotificationList>("/api/notifications")
        } catch (e: ApiException) {
            // keep the last number
        }
    }

    // The phone's Back button closes Profile or the wine page. On a tab it leaves the app, as usual.
    BackHandler(enabled = detail != null) { detail = null }
    BackHandler(enabled = formOpen, onBack = closeForm)
    BackHandler(enabled = profileOpen, onBack = profileBack)
    BackHandler(enabled = notificationsOpen) { notificationsOpen = false }

    Column(modifier = modifier.fillMaxSize()) {
        TopBar(
            title = when {
                notificationsOpen -> "Notifications"
                profileOpen -> PROFILE_PAGES[profilePage] ?: "Profile"
                adding -> "Add bottle"
                editing != null -> "Edit bottle"
                else -> tab.label
            },
            user = user,
            unread = notifications.unread,
            onBell = { notificationsOpen = !notificationsOpen },
            profileOpen = profileOpen,
            showBack = notificationsOpen || profileOpen || formOpen || detail != null,
            cellars = cellars,
            cellarId = cellarId,
            onCellar = { cellarId = it },
            onBack = {
                when {
                    notificationsOpen -> notificationsOpen = false
                    profileOpen -> profileBack()
                    formOpen -> closeForm()
                    else -> detail = null
                }
            },
            onProfile = {
                notificationsOpen = false
                profileOpen = !profileOpen
                profilePage = null
            },
        )
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            if (profileOpen) {
                ProfileScreen(
                    user = user,
                    page = profilePage,
                    onPage = { profilePage = it },
                    cellars = cellars,
                    cellarId = cellarId,
                    onUser = onUser,
                    onLogout = onLogout,
                    onCellarsChanged = { newId ->
                        if (newId != null) cellarId = newId
                        cellarLoads++
                        changes++
                    },
                )
            } else {
                pages.SaveableStateProvider(tab) {
                    when (tab) {
                        MainTab.Cellar -> CellarScreen(
                            cellarId = cellarId,
                            reloadKey = changes,
                            userName = user.shownName.substringBefore(' '),
                            highlightId = highlight,
                            moving = moving,
                            onMoveDone = { moved ->
                                moving = null
                                if (moved != null) {
                                    changes++
                                    highlight = moved.id
                                }
                            },
                            onOpen = { detail = it },
                            onAdd = { adding = cellarId != null },
                            onInventory = { tab = MainTab.Inventory },
                        )
                        MainTab.Inventory -> InventoryScreen(
                            cellarId = cellarId,
                            reloadKey = changes,
                            onOpen = { detail = it },
                            onAdd = { adding = cellarId != null },
                        )
                        MainTab.Sommelier -> SommelierScreen(
                            startWine = askWine,
                            onStarted = { askWine = null },
                            backEnabled = detail == null && !formOpen && !notificationsOpen,
                            onPick = { detail = it },
                        )
                        MainTab.Briefing -> BriefingScreen(
                            cellarId = cellarId,
                            onOpen = { detail = it },
                            onValue = { tab = MainTab.Value },
                        )
                        MainTab.Value -> ValueScreen(onOpen = { detail = it })
                    }
                }
                // Drawn over the page, which stays as it was (scroll position, search) underneath.
                // key(...) starts the page afresh when another wine, or an edited one, is shown.
                detail?.let {
                    key(it) {
                        WineDetailsScreen(
                            bottle = it,
                            onClose = { detail = null },
                            onEdit = { b -> editing = b },
                            onFind = { b -> showOnMap(b, false) },
                            onMove = { b -> showOnMap(b, true) },
                            onAsk = { b ->
                                askWine = b
                                tab = MainTab.Sommelier
                                detail = null
                            },
                            onChanged = { changes++ },
                        )
                    }
                }
                if (formOpen) {
                    BottleFormScreen(
                        cellarId = editing?.cellarId ?: cellarId ?: 0,
                        bottle = editing,
                        onClose = closeForm,
                        onSaved = { saved ->
                            closeForm()
                            changes++
                            detail = saved
                        },
                    )
                }
            }
            // Drawn over whatever is open, so that page (a tasting, a form) is still there after Back.
            if (notificationsOpen) {
                NotificationsPage(notifications.items, onReadAll = {
                    scope.launch {
                        try {
                            Api.request("POST", "/api/notifications/read", "{}")
                            notifications = Api.get<NotificationList>("/api/notifications")
                        } catch (e: ApiException) {
                            // the list stays as it is
                        }
                    }
                })
            }
        }
        TabBar(
            selected = if (profileOpen) null else tab,
            onSelect = {
                tab = it
                notificationsOpen = false
                profileOpen = false
                profilePage = null
                detail = null
                moving = null
                closeForm()
            },
        )
    }
}

/** The newest notifications as a page: what it is about, when, and the message. Read ones are quieter. */
@Composable
private fun NotificationsPage(list: List<Notification>, onReadAll: () -> Unit) {
    val colors = AppTheme.colors
    val unread = list.count { it.read == 0 }
    Column(
        // the empty pointerInput keeps taps from reaching the page underneath
        modifier = Modifier.fillMaxSize().background(colors.background).pointerInput(Unit) { detectTapGestures { } }.padding(horizontal = 20.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = if (list.isEmpty()) "Nothing yet." else if (unread == 0) "All read" else "$unread unread",
                style = AppType.body,
                color = colors.muted,
                modifier = Modifier.weight(1f),
            )
            if (unread > 0) LinkButton("Mark all read", onClick = onReadAll)
        }
        LazyColumn {
            items(list, key = { it.id }) { n ->
                val fresh = n.read == 0
                val level = when (n.level) {
                    "critical" -> colors.danger
                    "warning" -> colors.warn
                    else -> colors.accent
                }
                Row(modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(Modifier.padding(top = 6.dp).size(8.dp).background(if (fresh) level else colors.hairline, CircleShape))
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = when (n.kind) {
                                    "environment" -> "Climate"
                                    "window" -> "Drinking window"
                                    "briefing" -> "Daily briefing"
                                    else -> n.kind.replace('_', ' ').replaceFirstChar { it.uppercase() }
                                },
                                style = AppType.bodyStrong,
                                color = if (fresh) level else colors.muted,
                                modifier = Modifier.weight(1f),
                            )
                            Text(localTime(n.createdAt), style = AppType.caption, color = colors.muted)
                        }
                        Text(n.message, style = AppType.body, color = if (fresh) colors.fg else colors.muted)
                    }
                }
                Box(Modifier.fillMaxWidth().height(1.dp).background(colors.hairline))
            }
        }
    }
}

/** "2026-11-16 03:20:00" (UTC, as the server stores it) gives "16 Nov 12:20" on a phone in Seoul. */
private fun localTime(utc: String): String = try {
    val parser = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
    SimpleDateFormat("d MMM HH:mm", Locale.US).format(parser.parse(utc.replace('T', ' ').take(19))!!)
} catch (e: Exception) {
    utc
}

@Composable
private fun TopBar(
    title: String,
    user: User,
    unread: Int,
    onBell: () -> Unit,
    profileOpen: Boolean,
    showBack: Boolean,
    cellars: List<CellarSummary>,
    cellarId: Int?,
    onCellar: (Int) -> Unit,
    onBack: () -> Unit,
    onProfile: () -> Unit,
) {
    val colors = AppTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(64.dp)
            .padding(start = if (showBack) 8.dp else 20.dp, end = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (showBack) {
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
        // Choosing a cellar is only needed when there is more than one.
        if (cellars.size > 1) {
            var open by remember { mutableStateOf(false) }
            Box {
                LinkButton(text = cellars.firstOrNull { it.id == cellarId }?.name ?: "Cellar", onClick = { open = true })
                DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                    for (cellar in cellars) {
                        DropdownMenuItem(
                            text = { Text(cellar.name) },
                            onClick = {
                                onCellar(cellar.id)
                                open = false
                            },
                        )
                    }
                }
            }
        }
        Bell(unread, onBell)
        Avatar(user = user, on = profileOpen, onClick = onProfile)
    }
}

/** Shows how many notifications are unread and opens the list. */
@Composable
private fun Bell(unread: Int, onClick: () -> Unit) {
    val colors = AppTheme.colors
    val description = if (unread > 0) "Notifications, $unread unread" else "Notifications"
    Box(
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
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
