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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import com.example.omnicave.ui.theme.OmniCaveTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // The app is always dark, so ask for light status-bar and navigation-bar icons.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        setContent {
            OmniCaveTheme {
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

    // On start (and on Retry): if a token was saved, ask the server who it belongs to.
    LaunchedEffect(attempt) {
        val saved = session.token ?: return@LaunchedEffect
        checking = true
        startError = null
        Api.token = saved
        try {
            user = Api.get<User>("/api/me")
        } catch (e: ApiException) {
            if (e.status == 401) {
                // The saved login expired: forget it and show Log in.
                session.token = null
                Api.token = null
            } else {
                startError = e.message
            }
        }
        checking = false
    }

    Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
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

            else -> HomeScreen(
                user = current,
                onLogout = {
                    scope.launch {
                        // Tell the server, but log out locally even if that fails.
                        try {
                            Api.request("POST", "/api/auth/logout")
                        } catch (e: ApiException) {
                            // ignored on purpose
                        }
                        session.token = null
                        Api.token = null
                        user = null
                    }
                },
                modifier = content,
            )
        }
    }
}

/** Placeholder until the tabs arrive in the next step. */
@Composable
fun HomeScreen(user: User, onLogout: () -> Unit, modifier: Modifier = Modifier) {
    Centered(modifier) {
        Text("Welcome, ${user.displayName ?: user.username}", style = MaterialTheme.typography.headlineSmall)
        Text(user.email, style = MaterialTheme.typography.bodyMedium)
        OutlinedButton(onClick = onLogout) { Text("Log out") }
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
