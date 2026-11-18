package com.example.omnicave.ui.auth

import android.app.DatePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.omnicave.R
import com.example.omnicave.data.Api
import com.example.omnicave.data.ApiException
import com.example.omnicave.data.AuthResult
import com.example.omnicave.data.LoginRequest
import com.example.omnicave.data.RegisterRequest
import com.example.omnicave.data.SignUpResult
import com.example.omnicave.ui.components.AppTextField
import com.example.omnicave.ui.components.ConsentList
import com.example.omnicave.ui.components.ControlShape
import com.example.omnicave.ui.components.Hint
import com.example.omnicave.ui.components.LinkButton
import com.example.omnicave.ui.components.Logo
import com.example.omnicave.ui.components.PrimaryButton
import com.example.omnicave.ui.components.rememberLegal
import com.example.omnicave.ui.components.requiredAccepted
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.LocalDate

// Same rules and wording as the display's Log in / Sign up.
private val USERNAME_RE = Regex("^[A-Za-z0-9_.-]{3,32}$")
private val EMAIL_RE = Regex("^[^\\s@]+@[^\\s@]+\\.[A-Za-z]{2,}$")

private fun passwordChecks(p: String): List<Pair<String, Boolean>> = listOf(
    "At least 8 characters" to (p.length >= 8),
    "A lowercase letter" to p.any { it in 'a'..'z' },
    "An uppercase letter" to p.any { it in 'A'..'Z' },
    "A number" to p.any { it in '0'..'9' },
    "A special character" to p.any { it !in 'a'..'z' && it !in 'A'..'Z' && it !in '0'..'9' },
)

/** The large light title under the logo. */
private val AuthTitle = AppType.hero.copy(fontSize = 36.sp, lineHeight = 42.sp, letterSpacing = (-1).sp)

/** Youth Protection Act: from 1 January of the year you turn 19 (only the birth year counts, as on the server). */
private const val MIN_AGE = 19
private fun oldEnough(date: String) = date.length == 10 && LocalDate.now().year - date.take(4).toInt() >= MIN_AGE
private val CODE_RE = Regex("^\\d{6}$")

/**
 * Log in, Sign up, the email-code page (verify the address after sign-up) and Forgot password.
 * Calls [onLoggedIn] after a successful login or verification.
 */
@Composable
fun AuthScreen(onLoggedIn: (AuthResult) -> Unit, modifier: Modifier = Modifier) {
    var page by rememberSaveable { mutableStateOf("login") }
    var createdUsername by rememberSaveable { mutableStateOf<String?>(null) }
    var note by rememberSaveable { mutableStateOf<String?>(null) }   // shown on the next page
    var verifyWho by rememberSaveable { mutableStateOf("") }          // email or username to verify

    when (page) {
        "signup" -> SignUpForm(
            onBack = { page = "login" },
            onCreated = { createdUsername = it; page = "login" },
            onVerify = { email -> verifyWho = email; note = "We sent a 6-digit code to $email."; page = "verify" },
            modifier = modifier,
        )
        "verify" -> VerifyEmailForm(verifyWho, note.orEmpty(), onLoggedIn, onBack = { note = null; page = "login" }, modifier = modifier)
        "forgot" -> ForgotPasswordForm(onBack = { message -> note = message; page = "login" }, modifier = modifier)
        else -> LogInForm(
            createdUsername = createdUsername,
            note = note,
            onLoggedIn = onLoggedIn,
            onSignUp = { createdUsername = null; note = null; page = "signup" },
            onVerify = { who, message -> verifyWho = who; note = message; page = "verify" },
            onForgot = { note = null; page = "forgot" },
            modifier = modifier,
        )
    }
}

@Composable
private fun LogInForm(
    createdUsername: String?,
    note: String?,
    onLoggedIn: (AuthResult) -> Unit,
    onSignUp: () -> Unit,
    onVerify: (who: String, message: String) -> Unit,
    onForgot: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var name by rememberSaveable { mutableStateOf(createdUsername ?: "") }
    var password by remember { mutableStateOf("") } // never saved
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val ready = name.isNotBlank() && password.isNotEmpty() && !busy

    fun submit() {
        if (!ready) return
        busy = true
        error = null
        scope.launch {
            try {
                val result: AuthResult =
                    Api.post("/api/auth/login", LoginRequest(name.trim(), password))
                onLoggedIn(result)
            } catch (e: ApiException) {
                // 403 = right password, but the email address is not verified yet
                if (e.status == 403) onVerify(name.trim(), e.message ?: "") else
                    error = if (e.status == 401) "Invalid username or password" else e.message
            } finally {
                busy = false
            }
        }
    }

    AuthPage(title = "Welcome back", modifier = modifier) {
        if (createdUsername != null) {
            Note("Account created. Log in to continue.", isError = false)
        }
        note?.let { Note(it, isError = false) }
        Fields {
            AppTextField(
                value = name,
                onValueChange = { name = it },
                label = "Username or email",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            )
            AppTextField(
                value = password,
                onValueChange = { password = it },
                label = "Password",
                isPassword = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { submit() }),
            )
        }
        error?.let { Note(it, isError = true) }
        PrimaryButton(text = if (busy) "Logging in…" else "Log in", onClick = { submit() }, enabled = ready)
        LinkButton(text = "Forgot password?", onClick = onForgot)
        LinkButton(text = "Create an account", onClick = onSignUp)
    }
}

@Composable
private fun SignUpForm(
    onBack: () -> Unit,
    onCreated: (String) -> Unit,
    onVerify: (email: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var username by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var birth by rememberSaveable { mutableStateOf("") }
    var consents by rememberSaveable { mutableStateOf(mapOf<String, Boolean>()) }
    val (legal, legalError) = rememberLegal()
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val checks = passwordChecks(password)
    val usernameOk = USERNAME_RE.matches(username.trim())
    val emailOk = EMAIL_RE.matches(email.trim())
    val matches = password.isNotEmpty() && password == confirm
    val valid = usernameOk && emailOk && checks.all { it.second } && matches &&
        oldEnough(birth) && legal != null && requiredAccepted(legal, consents)

    fun submit() {
        if (!valid || busy) return
        busy = true
        error = null
        scope.launch {
            try {
                // Like the display: with email verification on, the code page comes first;
                // otherwise signing up returns to Log in, it does not log in by itself.
                val result: SignUpResult = Api.post(
                    "/api/auth/register",
                    RegisterRequest(username.trim(), email.trim(), password, birth, consents),
                )
                if (result.verificationRequired) onVerify(result.email) else onCreated(username.trim())
            } catch (e: ApiException) {
                error = e.message
            } finally {
                busy = false
            }
        }
    }

    AuthPage(title = "Create account", modifier = modifier) {
        Fields {
            AppTextField(
                value = username,
                onValueChange = { if (it.length <= 32) username = it },
                label = "Username",
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            )
            if (username.isNotEmpty() && !usernameOk) Hint("3–32 letters, numbers, . _ or -", ok = false)

            AppTextField(
                value = email,
                onValueChange = { email = it },
                label = "Email",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            )
            if (email.isNotEmpty() && !emailOk) Hint("Enter an email like name@example.com", ok = false)

            AppTextField(
                value = password,
                onValueChange = { password = it },
                label = "Password",
                isPassword = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
            )
            Column(
                verticalArrangement = Arrangement.spacedBy(4.dp),
                modifier = Modifier.padding(start = 4.dp),
            ) {
                checks.forEach { (label, ok) -> Hint(label, ok) }
            }

            AppTextField(
                value = confirm,
                onValueChange = { confirm = it },
                label = "Confirm password",
                placeholder = "Re-enter password",
                isPassword = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { submit() }),
            )
            if (confirm.isNotEmpty()) {
                Hint(if (matches) "Passwords match" else "Passwords don't match", ok = matches)
            }
            DateField(birth, { birth = it }, label = "Date of birth")
            if (birth.isNotEmpty() && !oldEnough(birth)) Hint("You must be $MIN_AGE or older to use OmniCave", ok = false)
        }
        legal?.let { ConsentList(it, consents) { v -> consents = v } }
        legalError?.let { Note("Couldn't load the terms: $it", isError = true) }
        error?.let { Note(it, isError = true) }
        PrimaryButton(
            text = if (busy) "Creating account…" else "Sign up",
            onClick = { submit() },
            enabled = valid && !busy,
        )
        LinkButton(text = "I already have an account", onClick = onBack)
    }
}

/** Shared layout, as on the display: logo, app name and title centred, then the page's content. */
@Composable
private fun AuthPage(
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = AppTheme.colors
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp, alignment = Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(88.dp)
                .background(colors.surface, RoundedCornerShape(20.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Logo(size = 44.dp, color = colors.glow)
        }
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = stringResource(R.string.app_name).uppercase(),
                style = AppType.overline.copy(letterSpacing = 2.6.sp),
                color = colors.muted,
            )
            Text(text = title, style = AuthTitle, color = colors.fg, textAlign = TextAlign.Center)
        }
        Spacer(Modifier.height(4.dp))
        content()
    }
}

/** The group of input boxes, left-aligned and evenly spaced. */
@Composable
private fun Fields(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        content = content,
    )
}

/** A centred status line: green after success, red for an error. */
@Composable
private fun Note(text: String, isError: Boolean) {
    val colors = AppTheme.colors
    Text(
        text = text,
        style = AppType.body,
        color = if (isError) colors.danger else colors.ok,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

/** A date chosen with Android's calendar dialog, shown like the other boxes. [value] is "YYYY-MM-DD" or "". */
@Composable
private fun DateField(value: String, onValueChange: (String) -> Unit, label: String) {
    val colors = AppTheme.colors
    val context = LocalContext.current
    fun open() {
        val start = runCatching { LocalDate.parse(value) }.getOrElse { LocalDate.now().minusYears(30) }
        DatePickerDialog(context, { _, y, m, d -> onValueChange(LocalDate.of(y, m + 1, d).toString()) }, start.year, start.monthValue - 1, start.dayOfMonth)
            .apply { datePicker.maxDate = System.currentTimeMillis() }
            .show()
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label.uppercase(), style = AppType.overline, color = colors.muted)
        Box(
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).background(colors.surface, ControlShape)
                .border(1.dp, colors.hairline, ControlShape).clickable { open() }.padding(horizontal = 14.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            Text(value.ifEmpty { "Choose a date" }, style = AppType.body, color = if (value.isEmpty()) colors.muted else colors.fg)
        }
    }
}

/** The 6-digit code from the email: digits only. */
@Composable
private fun CodeField(value: String, onValueChange: (String) -> Unit, onDone: () -> Unit = {}) {
    AppTextField(
        value = value,
        onValueChange = { onValueChange(it.filter(Char::isDigit).take(6)) },
        label = "6-digit code",
        placeholder = "000000",
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onDone() }),
    )
}

/** After sign-up (or a login refused for an unverified address): enter the emailed code, then you are logged in. */
@Composable
private fun VerifyEmailForm(who: String, note: String, onLoggedIn: (AuthResult) -> Unit, onBack: () -> Unit, modifier: Modifier = Modifier) {
    var code by rememberSaveable { mutableStateOf("") }
    var message by remember { mutableStateOf<Pair<String, Boolean>?>(null) }   // text, isError
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun verify() {
        if (!CODE_RE.matches(code) || busy) return
        busy = true
        message = null
        scope.launch {
            try {
                onLoggedIn(Api.decode<AuthResult>(Api.request("POST", "/api/auth/verify-email", buildJsonObject { put("email", who); put("code", code) }.toString())))
            } catch (e: ApiException) {
                message = (e.message ?: "") to true
            } finally {
                busy = false
            }
        }
    }

    fun resend() = scope.launch {
        message = try {
            Api.request("POST", "/api/auth/resend-code", buildJsonObject { put("email", who) }.toString())
            "If the address needs a code, a new one is on its way." to false
        } catch (e: ApiException) {
            (e.message ?: "") to true
        }
    }

    AuthPage(title = "Check your email", modifier = modifier) {
        Text(note, style = AppType.body, color = AppTheme.colors.fg2, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        Fields { CodeField(code, { code = it }, onDone = { verify() }) }
        message?.let { (text, isError) -> Note(text, isError) }
        PrimaryButton(text = if (busy) "Checking…" else "Verify", onClick = { verify() }, enabled = CODE_RE.matches(code) && !busy)
        LinkButton(text = "Send a new code", onClick = { resend() })
        LinkButton(text = "Back to log in", onClick = onBack)
    }
}

/** Forgot password: email, then code + new password, then back to Log in. Every session of the account is logged out. */
@Composable
private fun ForgotPasswordForm(onBack: (message: String?) -> Unit, modifier: Modifier = Modifier) {
    var email by rememberSaveable { mutableStateOf("") }
    var sent by rememberSaveable { mutableStateOf(false) }
    var code by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val checks = passwordChecks(password)
    val matches = password.isNotEmpty() && password == confirm
    val emailOk = EMAIL_RE.matches(email.trim())

    fun run(path: String, body: String, then: () -> Unit) {
        if (busy) return
        busy = true
        error = null
        scope.launch {
            try {
                Api.request("POST", path, body)
                then()
            } catch (e: ApiException) {
                error = e.message
            } finally {
                busy = false
            }
        }
    }

    AuthPage(title = "Reset password", modifier = modifier) {
        val colors = AppTheme.colors
        if (!sent) {
            Text("Enter your account's email address. We'll send you a 6-digit code.", style = AppType.body, color = colors.fg2, textAlign = TextAlign.Center)
            Fields {
                AppTextField(email, { email = it }, label = "Email", keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Done))
            }
            error?.let { Note(it, isError = true) }
            PrimaryButton(text = if (busy) "Sending…" else "Send code", enabled = emailOk && !busy, onClick = {
                run("/api/auth/forgot-password", buildJsonObject { put("email", email.trim()) }.toString()) { sent = true }
            })
        } else {
            Text("If ${email.trim()} has an account, a code is on its way.", style = AppType.body, color = colors.fg2, textAlign = TextAlign.Center)
            Fields {
                CodeField(code, { code = it })
                AppTextField(password, { password = it }, label = "New password", isPassword = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next))
                Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(start = 4.dp)) {
                    checks.forEach { (label, ok) -> Hint(label, ok) }
                }
                AppTextField(confirm, { confirm = it }, label = "Confirm password", placeholder = "Re-enter password", isPassword = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done))
                if (confirm.isNotEmpty()) Hint(if (matches) "Passwords match" else "Passwords don't match", ok = matches)
            }
            error?.let { Note(it, isError = true) }
            PrimaryButton(
                text = if (busy) "Saving…" else "Set new password",
                enabled = CODE_RE.matches(code) && checks.all { it.second } && matches && !busy,
                onClick = {
                    run("/api/auth/reset-password", buildJsonObject { put("email", email.trim()); put("code", code); put("password", password) }.toString()) {
                        onBack("Password changed. Log in with your new password.")
                    }
                },
            )
            LinkButton(text = "Use another email", onClick = { sent = false; code = "" })
        }
        LinkButton(text = "Back to log in", onClick = { onBack(null) })
    }
}
