package com.example.omnicave.ui.profile

import android.app.TimePickerDialog
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.example.omnicave.BuildConfig
import com.example.omnicave.data.Api
import com.example.omnicave.data.ApiException
import com.example.omnicave.data.CellarSummary
import com.example.omnicave.data.Preferences
import com.example.omnicave.data.User
import com.example.omnicave.data.initials
import com.example.omnicave.data.shownName
import com.example.omnicave.ui.components.AppIcons
import com.example.omnicave.ui.components.AppTextField
import com.example.omnicave.ui.components.LinkButton
import com.example.omnicave.ui.components.Pill
import com.example.omnicave.ui.components.PrimaryButton
import com.example.omnicave.ui.components.SecondaryButton
import com.example.omnicave.ui.components.SectionHead
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put
import java.util.Locale

/** The settings pages inside Profile: (key, title in the top bar). */
val PROFILE_PAGES = mapOf(
    "account" to "Edit profile", "cellars" to "My cellars", "climate" to "Climate & alerts",
    "taste" to "Taste preferences", "privacy" to "Privacy & data", "about" to "About",
)

/** Same groups and choices as the display's taste preferences. */
private val TASTE = listOf(
    "Styles" to listOf("Red", "White", "Rosé", "Sparkling", "Dessert"),
    "Regions" to listOf("Bordeaux", "Burgundy", "Champagne", "Rhône", "Piedmont", "Tuscany", "Rioja", "Mosel", "Napa", "Mendoza"),
    "Grapes" to listOf("Cabernet Sauvignon", "Pinot Noir", "Nebbiolo", "Syrah", "Sangiovese", "Tempranillo", "Chardonnay", "Riesling", "Sauvignon Blanc", "Grenache"),
)
private val EMAIL = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

/** Writes empty lists too, so that unticking the last choice of a group really clears it on the server. */
private val FullJson = Json(Api.json) { encodeDefaults = true }

/** Profile (opened from the avatar) with the settings list below it. [page] is the settings page shown instead, if any. */
@Composable
fun ProfileScreen(
    user: User,
    page: String?,
    onPage: (String) -> Unit,
    cellars: List<CellarSummary>,
    cellarId: Int?,
    onUser: (User) -> Unit,
    onLogout: () -> Unit,
    onCellarsChanged: (newId: Int?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = AppTheme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val toast = { text: String? -> Toast.makeText(context, text ?: "Something went wrong", Toast.LENGTH_SHORT).show() }
    // Saves a change to the account; the server's answer becomes the user shown everywhere.
    val patchMe = { body: JsonObject, ok: String? ->
        scope.launch {
            try {
                onUser(Api.decode<User>(Api.request("PATCH", "/api/me", body.toString())))
                if (ok != null) toast(ok)
            } catch (e: ApiException) {
                toast(e.message)
            }
        }
        Unit
    }

    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        when (page) {
            "account" -> AccountPage(user, patchMe)
            "cellars" -> CellarsPage(cellars, onCellarsChanged, toast)
            "climate" -> ClimateSettings(cellarId, toast)
            "taste" -> TastePage(user.preferences, patchMe)
            "privacy" -> PrivacyPage(user, onLogout, toast)
            "about" -> AboutPage(user)
            else -> {
                Column(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(modifier = Modifier.size(88.dp).background(colors.accent, CircleShape), contentAlignment = Alignment.Center) {
                        Text(user.initials, style = AppType.display, color = colors.onAccent)
                    }
                    Text(user.shownName, style = AppType.headline, color = colors.fg, textAlign = TextAlign.Center)
                    Text("Signed in as ${user.username} · ${user.email}", style = AppType.caption, color = colors.muted, textAlign = TextAlign.Center)
                    LinkButton("Edit profile", onClick = { onPage("account") })
                }
                val taste = user.preferences.run { styles + regions + grapes }
                val time = user.briefingTime.split(":").mapNotNull { it.toIntOrNull() }
                SectionHead("Settings")
                Column {
                    SettingRow("My cellars", if (cellars.size == 1) "1 cellar" else "${cellars.size} cellars") { onPage("cellars") }
                    cellars.firstOrNull { it.id == cellarId }?.let { SettingRow("Climate & alerts", it.name) { onPage("climate") } }
                    SettingRow("Taste preferences", if (taste.isEmpty()) "Not set" else taste.take(2).joinToString(", ") + if (taste.size > 2) " +${taste.size - 2}" else "") { onPage("taste") }
                    SettingRow("Daily briefing", "Sent at ${user.briefingTime}") {
                        TimePickerDialog(context, { _, hour, minute ->
                            patchMe(buildJsonObject { put("briefing_time", "%02d:%02d".format(Locale.US, hour, minute)) }, "Briefing time saved")
                        }, time.getOrElse(0) { 8 }, time.getOrElse(1) { 0 }, true).show()
                    }
                    SettingRow("Privacy & data") { onPage("privacy") }
                    SettingRow("About") { onPage("about") }
                }
                LinkButton("Log out", onClick = onLogout, color = colors.danger, modifier = Modifier.align(Alignment.CenterHorizontally))
            }
        }
    }
}

/** A line of a settings list: a label, its current value and, when it can be tapped, a chevron. */
@Composable
fun SettingRow(label: String, value: String = "", onClick: (() -> Unit)? = null) {
    val colors = AppTheme.colors
    Row(
        modifier = Modifier.fillMaxWidth().clickable(enabled = onClick != null) { onClick?.invoke() }.heightIn(min = 52.dp).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(label, style = AppType.body, color = colors.fg, modifier = Modifier.weight(1f))
        Text(value, style = AppType.caption, color = colors.muted, textAlign = TextAlign.End, modifier = Modifier.weight(1f, fill = false))
        if (onClick != null) Icon(AppIcons.Chevron, contentDescription = null, tint = colors.muted, modifier = Modifier.size(18.dp))
    }
    Box(Modifier.fillMaxWidth().height(1.dp).background(colors.hairline))
}

@Composable
private fun AccountPage(user: User, patchMe: (JsonObject, String?) -> Unit) {
    val colors = AppTheme.colors
    // remember(user): after a save the fields start again from the saved values, with the password boxes empty
    var name by remember(user) { mutableStateOf(user.displayName.orEmpty()) }
    var email by remember(user) { mutableStateOf(user.email) }
    var password by remember(user) { mutableStateOf("") }
    var repeat by remember(user) { mutableStateOf("") }
    val emailOk = EMAIL.matches(email.trim())
    val passwordError = when {
        password.isEmpty() -> null
        password.length < 8 -> "At least 8 characters"
        password != repeat -> "Passwords do not match"
        else -> null
    }
    AppTextField(name, { name = it }, label = "Name")
    AppTextField(email, { email = it }, label = "Email", keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
    if (!emailOk && email.isNotEmpty()) Text("Enter a valid email address", style = AppType.caption, color = colors.danger)
    AppTextField(password, { password = it }, label = "New password", placeholder = "Leave empty to keep it", isPassword = true)
    if (password.isNotEmpty()) AppTextField(repeat, { repeat = it }, label = "Repeat new password", placeholder = "", isPassword = true)
    passwordError?.let { Text(it, style = AppType.caption, color = colors.danger) }
    Text("Username: ${user.username} (cannot be changed)", style = AppType.caption, color = colors.muted)
    PrimaryButton("Save Changes", enabled = emailOk && passwordError == null, onClick = {
        patchMe(buildJsonObject {
            put("display_name", name.trim())
            put("email", email.trim())
            if (password.isNotEmpty()) put("password", password)
        }, "Changes saved")
    })
}

/** Every tap on a choice is saved at once. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TastePage(prefs: Preferences, patchMe: (JsonObject, String?) -> Unit) {
    var avoid by remember { mutableStateOf(prefs.dislikes) }
    val save = { p: Preferences, ok: String? -> patchMe(buildJsonObject { put("preferences", FullJson.encodeToJsonElement(p)) }, ok) }
    Text("The sommeliers use these when they recommend wines for you.", style = AppType.caption, color = AppTheme.colors.muted)
    TASTE.forEachIndexed { i, (title, options) ->
        val chosen = listOf(prefs.styles, prefs.regions, prefs.grapes)[i]
        SectionHead(title)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for (o in options) {
                Pill(o, on = o in chosen, onClick = {
                    val next = if (o in chosen) chosen - o else chosen + o
                    save(if (i == 0) prefs.copy(styles = next) else if (i == 1) prefs.copy(regions = next) else prefs.copy(grapes = next), null)
                })
            }
        }
    }
    SectionHead("Anything you avoid")
    AppTextField(avoid, { avoid = it }, label = "", placeholder = "e.g. very oaky whites")
    if (avoid != prefs.dislikes) SecondaryButton("Save", onClick = { save(prefs.copy(dislikes = avoid), "Saved") })
}

@Composable
private fun PrivacyPage(user: User, onDeleted: () -> Unit, toast: (String?) -> Unit) {
    val colors = AppTheme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var confirm by remember { mutableStateOf(false) }
    var exported by remember { mutableStateOf("") }
    // Android's own "save as" page; the export is written to the file the user chooses there.
    val saveFile = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri != null) {
            runCatching { context.contentResolver.openOutputStream(uri)?.use { it.write(exported.toByteArray()) } }
                .fold({ toast("Saved") }, { toast("Could not save the file") })
        }
    }
    Text("Your data belongs to you. Take a copy or delete it.", style = AppType.caption, color = colors.muted)
    Column {
        SettingRow("Export my data", "JSON file") {
            scope.launch {
                try {
                    exported = Api.request("GET", "/api/me/export")
                    saveFile.launch("omnicave-export-${user.username}.json")
                } catch (e: ApiException) {
                    toast(e.message)
                }
            }
        }
        SettingRow("Delete account") { confirm = true }
    }
    if (confirm) {
        Column(modifier = Modifier.background(colors.surface, RoundedCornerShape(12.dp)).padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Delete your account?", style = AppType.heading, color = colors.fg)
            Text("Your account, every cellar and all bottle history are deleted for good. This cannot be undone.", style = AppType.body, color = colors.fg2)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SecondaryButton("Delete permanently", danger = true, onClick = {
                    scope.launch {
                        try {
                            Api.request("DELETE", "/api/me")
                            onDeleted()
                        } catch (e: ApiException) {
                            toast(e.message)
                        }
                    }
                })
                SecondaryButton("Keep", onClick = { confirm = false })
            }
        }
    }
}

@Serializable
private data class Provider(val provider: String = "", val model: String = "")

/** Answer of GET /api/health: which AI services the server is using. */
@Serializable
private data class Health(val llm: Provider = Provider(), val vision: Provider = Provider())

@Composable
private fun AboutPage(user: User) {
    var health by remember { mutableStateOf<Health?>(null) }
    LaunchedEffect(Unit) {
        try {
            health = Api.get<Health>("/api/health")
        } catch (e: ApiException) {
        }
    }
    val name = { p: Provider? -> if (p == null) "—" else if (p.provider == "mock") "Offline demo" else p.model.ifEmpty { p.provider } }
    Column {
        SettingRow("Signed in as", user.username)
        SettingRow("AI sommeliers", name(health?.llm))
        SettingRow("Camera recognition", name(health?.vision))
        SettingRow("Version", "OmniCave for Android ${BuildConfig.VERSION_NAME}")
    }
}

/** The cellars with their bottle counts. A row opens a small window to rename or remove it; the last row adds one. */
@Composable
private fun CellarsPage(cellars: List<CellarSummary>, onChanged: (Int?) -> Unit, toast: (String?) -> Unit) {
    var open by remember { mutableStateOf<CellarSummary?>(null) }
    var adding by remember { mutableStateOf(false) }
    val close = {
        open = null
        adding = false
    }
    Text("Each cellar keeps its own bottles and climate.", style = AppType.caption, color = AppTheme.colors.muted)
    Column {
        for (c in cellars) SettingRow(c.name, if (c.bottleCount == 1) "1 bottle" else "${c.bottleCount} bottles") { open = c }
        SettingRow("＋ Add a cellar") { adding = true }
    }
    if (open != null || adding) {
        CellarDialog(open, canRemove = cellars.size > 1, onClose = close, toast = toast, onDone = { id ->
            close()
            onChanged(id)
        })
    }
}

/** Rename or remove [cellar]; with null, add a new cellar that is kept by hand (appliances are linked on the display). */
@Composable
private fun CellarDialog(cellar: CellarSummary?, canRemove: Boolean, onClose: () -> Unit, onDone: (Int?) -> Unit, toast: (String?) -> Unit) {
    val colors = AppTheme.colors
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(cellar?.name ?: "") }
    var preset by remember { mutableStateOf("tall") }
    var presets by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var confirm by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        try {
            if (cellar == null) presets = Api.get<Map<String, String>>("/api/cellar-presets")
        } catch (e: ApiException) {
        }
    }
    fun send(method: String, path: String, body: JsonObject?, then: (String) -> Unit) {
        scope.launch {
            try {
                then(Api.request(method, path, body?.toString()))
            } catch (e: ApiException) {
                toast(e.message)
            }
        }
    }
    Dialog(onDismissRequest = onClose) {
        Column(modifier = Modifier.background(colors.surface, RoundedCornerShape(16.dp)).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(cellar?.name ?: "Add a cellar", style = AppType.title, color = colors.fg)
            AppTextField(name, { name = it.take(40) }, label = "Name", placeholder = "e.g. Kitchen cellar")
            if (cellar == null) {
                // "Compact (60×85×50 cm, 4 racks)" is shown as a title with the size below it
                for ((id, label) in presets) {
                    Row(modifier = Modifier.fillMaxWidth().clickable { preset = id }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(label.substringBefore(" ("), style = AppType.bodyStrong, color = colors.fg)
                            Text(label.substringAfter(" (", "").removeSuffix(")"), style = AppType.caption, color = colors.muted)
                        }
                        if (preset == id) Text("✓", style = AppType.heading, color = colors.accent)
                    }
                }
                PrimaryButton("Add cellar", onClick = {
                    val body = buildJsonObject {
                        put("name", name.trim().ifEmpty { "New Cellar" })
                        put("preset", preset)
                    }
                    send("POST", "/api/cellars", body) { onDone(Api.decode<CellarSummary>(it).id) }
                })
            } else {
                PrimaryButton("Save", enabled = name.isNotBlank() && name.trim() != cellar.name, onClick = {
                    send("PATCH", "/api/cellars/${cellar.id}", buildJsonObject { put("name", name.trim()) }) { onDone(null) }
                })
                if (canRemove) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        if (confirm) {
                            SecondaryButton("Remove with its bottles", danger = true, onClick = { send("DELETE", "/api/cellars/${cellar.id}", null) { onDone(null) } })
                            SecondaryButton("Keep", onClick = { confirm = false })
                        } else {
                            SecondaryButton("Remove this cellar", danger = true, onClick = { confirm = true })
                        }
                    }
                }
            }
        }
    }
}
