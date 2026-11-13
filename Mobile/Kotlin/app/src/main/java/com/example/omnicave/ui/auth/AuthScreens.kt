package com.example.omnicave.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import com.example.omnicave.ui.components.AppTextField
import com.example.omnicave.ui.components.Hint
import com.example.omnicave.ui.components.LinkButton
import com.example.omnicave.ui.components.Logo
import com.example.omnicave.ui.components.PrimaryButton
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType
import kotlinx.coroutines.launch

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

/** Shows Log in, or Sign up when the user asks for it. Calls [onLoggedIn] after a successful login. */
@Composable
fun AuthScreen(onLoggedIn: (AuthResult) -> Unit, modifier: Modifier = Modifier) {
    var signingUp by rememberSaveable { mutableStateOf(false) }
    var createdUsername by rememberSaveable { mutableStateOf<String?>(null) }

    if (signingUp) {
        SignUpForm(
            onBack = { signingUp = false },
            onCreated = { createdUsername = it; signingUp = false },
            modifier = modifier,
        )
    } else {
        LogInForm(
            createdUsername = createdUsername,
            onLoggedIn = onLoggedIn,
            onSignUp = { createdUsername = null; signingUp = true },
            modifier = modifier,
        )
    }
}

@Composable
private fun LogInForm(
    createdUsername: String?,
    onLoggedIn: (AuthResult) -> Unit,
    onSignUp: () -> Unit,
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
        LinkButton(text = "Create an account", onClick = onSignUp)
    }
}

@Composable
private fun SignUpForm(
    onBack: () -> Unit,
    onCreated: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var username by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val checks = passwordChecks(password)
    val usernameOk = USERNAME_RE.matches(username.trim())
    val emailOk = EMAIL_RE.matches(email.trim())
    val matches = password.isNotEmpty() && password == confirm
    val valid = usernameOk && emailOk && checks.all { it.second } && matches

    fun submit() {
        if (!valid || busy) return
        busy = true
        error = null
        scope.launch {
            try {
                // Like the display: signing up returns to Log in, it does not log in by itself.
                val created: AuthResult = Api.post(
                    "/api/auth/register",
                    RegisterRequest(username.trim(), email.trim(), password),
                )
                onCreated(created.user.username)
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
        }
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
