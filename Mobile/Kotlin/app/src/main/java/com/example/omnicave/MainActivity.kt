package com.example.omnicave

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.omnicave.ui.theme.OmniCaveTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.URL

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            OmniCaveTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    HealthScreen(modifier = Modifier.padding(innerPadding))
                }
            }
        }
    }
}

const val API_BASE = "https://54-206-251-224.sslip.io"

@Composable
fun HealthScreen(modifier: Modifier = Modifier) {
    var result by remember { mutableStateOf("Connecting...") }

    LaunchedEffect(Unit) {
        result = try {
            withContext(Dispatchers.IO) {
                URL("$API_BASE/api/health").readText()
            }
        } catch (e: Exception) {
            "Failed: ${e.message}"
        }
    }

    Text(text = result, modifier = modifier.padding(16.dp))
}
