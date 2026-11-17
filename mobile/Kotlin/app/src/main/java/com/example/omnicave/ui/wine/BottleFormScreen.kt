package com.example.omnicave.ui.wine

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.example.omnicave.data.Api
import com.example.omnicave.data.ApiException
import com.example.omnicave.data.Bottle
import com.example.omnicave.data.styleName
import com.example.omnicave.ui.components.AppTextField
import com.example.omnicave.ui.components.Pill
import com.example.omnicave.ui.components.PrimaryButton
import com.example.omnicave.ui.components.SecondaryButton
import com.example.omnicave.ui.theme.AppTheme
import com.example.omnicave.ui.theme.AppType
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.Calendar

/**
 * Add a bottle to [cellarId], or edit the wine of an existing [bottle].
 * A new bottle goes to the best free spot for its type; moving it is done on the cellar map.
 */
@Composable
fun BottleFormScreen(
    cellarId: Int,
    bottle: Bottle?,
    onClose: () -> Unit,
    onSaved: (Bottle) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = AppTheme.colors
    val scope = rememberCoroutineScope()
    val wine = bottle?.wine

    var name by rememberSaveable { mutableStateOf(wine?.name.orEmpty()) }
    var producer by rememberSaveable { mutableStateOf(wine?.producer.orEmpty()) }
    var region by rememberSaveable { mutableStateOf(wine?.region.orEmpty()) }
    var country by rememberSaveable { mutableStateOf(wine?.country.orEmpty()) }
    var grape by rememberSaveable { mutableStateOf(wine?.grape.orEmpty()) }
    var color by rememberSaveable { mutableStateOf(wine?.color ?: "red") }
    var vintage by rememberSaveable {
        mutableStateOf((if (wine != null) wine.vintage ?: 0 else Calendar.getInstance().get(Calendar.YEAR) - 3).toString())
    }
    var price by rememberSaveable { mutableStateOf(wine?.basePrice?.toBigDecimal()?.stripTrailingZeros()?.toPlainString().orEmpty()) }
    var drinkFrom by rememberSaveable { mutableStateOf(wine?.drinkFrom?.toString().orEmpty()) }
    var drinkTo by rememberSaveable { mutableStateOf(wine?.drinkTo?.toString().orEmpty()) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun save() = scope.launch {
        saving = true
        error = null
        // The request body, built as JSON by hand because the optional numbers are left out when empty.
        val body = buildJsonObject {
            if (bottle == null) put("cellar_id", cellarId)
            put("wine", buildJsonObject {
                put("name", name.trim())
                put("producer", producer.trim())
                put("region", region.trim())
                put("country", country.trim())
                put("grape", grape.trim())
                put("color", color)
                put("vintage", vintage.toIntOrNull() ?: 0)
                price.toDoubleOrNull()?.let { put("base_price", it) }
                drinkFrom.toIntOrNull()?.let { put("drink_from", it) }
                drinkTo.toIntOrNull()?.let { put("drink_to", it) }
            })
        }.toString()
        try {
            val answer = if (bottle == null) Api.request("POST", "/api/bottles", body)
            else Api.request("PATCH", "/api/bottles/${bottle.id}", body)
            onSaved(Api.decode<Bottle>(answer))
        } catch (e: ApiException) {
            error = e.message
        }
        saving = false
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
            .padding(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        val text = KeyboardOptions(imeAction = ImeAction.Next)
        val number = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Next)
        AppTextField(name, { name = it }, label = "Wine name *", placeholder = "", keyboardOptions = text)
        AppTextField(producer, { producer = it }, label = "Producer / winery *", placeholder = "", keyboardOptions = text)
        AppTextField(region, { region = it }, label = "Region", placeholder = "", keyboardOptions = text)
        AppTextField(country, { country = it }, label = "Country", placeholder = "", keyboardOptions = text)
        AppTextField(grape, { grape = it }, label = "Grape(s)", placeholder = "", keyboardOptions = text)

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("TYPE", style = AppType.overline, color = colors.muted)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (style in listOf("red", "white", "sparkling", "rose")) {
                    Pill(text = styleName(style), on = color == style, onClick = { color = style })
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AppTextField(vintage, { vintage = it }, label = "Vintage (0 = NV)", placeholder = "", keyboardOptions = number, modifier = Modifier.weight(1f))
            AppTextField(price, { price = it }, label = "Price (USD)", placeholder = "", keyboardOptions = number, modifier = Modifier.weight(1f))
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AppTextField(drinkFrom, { drinkFrom = it }, label = "Drink from", placeholder = "", keyboardOptions = number, modifier = Modifier.weight(1f))
            AppTextField(drinkTo, { drinkTo = it }, label = "Drink to", placeholder = "", keyboardOptions = number, modifier = Modifier.weight(1f))
        }

        if (bottle == null) {
            Text("The bottle is placed in the best free spot for its type.", style = AppType.caption, color = colors.muted)
        }
        error?.let { Text(it, style = AppType.caption, color = colors.danger) }

        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            SecondaryButton("Cancel", onClick = onClose, modifier = Modifier.heightIn(min = 52.dp))
            PrimaryButton(
                text = if (bottle == null) "Add to cellar" else "Save",
                onClick = { save() },
                enabled = name.isNotBlank() && producer.isNotBlank() && !saving,
                modifier = Modifier.weight(1f),
            )
        }
    }
}
