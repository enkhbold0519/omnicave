package com.example.omnicave

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.example.omnicave.data.Api
import com.example.omnicave.data.ApiException
import com.example.omnicave.data.Session
import com.example.omnicave.data.User
import com.example.omnicave.ui.auth.AuthScreen
import com.example.omnicave.ui.main.MainScreen
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.Appearance
import com.example.omnicave.ui.theme.OmniCaveTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Appearance.load(applicationContext)
        setContent {
            OmniCaveTheme {
                // Status-bar and navigation-bar icons: light ones on a dark look, dark ones on a light look.
                val dark = AppTheme.colors.isDark
                LaunchedEffect(dark) {
                    val bars = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
                    enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
                }
                App()
            }
        }
    }
}

/**
 * Decides what to show: a spinner while a saved login is checked, the login screens,
 * or the app itself once a user is known.
 */
@Composable
fun App() {
    val context = LocalContext.current
    val session = remember { Session(context.applicationContext) }
    val scope = rememberCoroutineScope()

    var user by remember { mutableStateOf<User?>(null) }
    var checking by remember { mutableStateOf(session.token != null) }
    var startError by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }

    // Forget the login on this phone and show Log in.
    val forgetLogin = {
        session.token = null
        Api.token = null
        user = null
    }

    // If the server rejects the saved login on any screen, go back to Log in.
    DisposableEffect(Unit) {
        Api.onUnauthorized = forgetLogin
        onDispose { Api.onUnauthorized = null }
    }

    // On start (and on Retry): if a token was saved, ask the server who it belongs to.
    LaunchedEffect(attempt) {
        val saved = session.token ?: return@LaunchedEffect
        checking = true
        startError = null
        Api.token = saved
        try {
            user = Api.get<User>("/api/me")
        } catch (e: ApiException) {
            // 401 = the saved login expired; that case is handled by onUnauthorized above.
            if (e.status != 401) startError = e.message
        }
        checking = false
    }

    Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
        // Keeps pages clear of the status bar and navigation bar, and above the keyboard when it opens.
        val content = Modifier
            .padding(innerPadding)
            .consumeWindowInsets(innerPadding)
            .imePadding()
        val current = user
        when {
            checking -> Centered(content) { CircularProgressIndicator() }

            startError != null -> Centered(content) {
                Text(startError ?: "", style = MaterialTheme.typography.bodyLarge)
                Button(onClick = { attempt++ }) { Text("Try again") }
            }

            current == null -> AuthScreen(
                onLoggedIn = { result ->
                    session.token = result.accessToken
                    Api.token = result.accessToken
                    user = result.user
                },
                modifier = content,
            )

            else -> MainScreen(
                user = current,
                onUser = { user = it },
                onLogout = {
                    scope.launch {
                        // Tell the server, but log out locally even if that fails.
                        try {
                            Api.request("POST", "/api/auth/logout")
                        } catch (e: ApiException) {
                            // ignored on purpose
                        }
                        forgetLogin()
                    }
                },
                modifier = content,
            )
        }
    }
}

@Composable
private fun Centered(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.padding(24.dp),
        ) {
            content()
        }
    }
}
