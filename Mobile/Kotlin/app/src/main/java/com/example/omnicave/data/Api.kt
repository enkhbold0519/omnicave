package com.example.omnicave.data

import com.example.omnicave.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/** A failed request. [status] is the HTTP code, or 0 when the server could not be reached. */
class ApiException(val status: Int, message: String) : Exception(message)

/** The one place that talks to the backend. Every screen goes through here. */
object Api {
    /** Sent as "Authorization: Bearer ..." on every request once the user is logged in. */
    var token: String? = null

    val json = Json { ignoreUnknownKeys = true }

    private val client = OkHttpClient()
    private val jsonType = "application/json".toMediaType()

    /** Sends one request and returns the response text, or throws [ApiException]. */
    suspend fun request(method: String, path: String, body: String? = null): String =
        withContext(Dispatchers.IO) {
            val requestBody = body?.toRequestBody(jsonType)
                ?: if (method == "GET") null else "".toRequestBody(jsonType)
            val builder = Request.Builder().url(BuildConfig.API_BASE + path).method(method, requestBody)
            token?.let { builder.header("Authorization", "Bearer $it") }

            val response = try {
                client.newCall(builder.build()).execute()
            } catch (e: IOException) {
                throw ApiException(0, "Can't reach the server")
            }
            response.use {
                val text = it.body?.string().orEmpty()
                if (!it.isSuccessful) {
                    throw ApiException(it.code, errorDetail(text) ?: "Request failed (${it.code})")
                }
                text
            }
        }

    suspend inline fun <reified T> get(path: String): T =
        json.decodeFromString(request("GET", path))

    suspend inline fun <reified T, reified B> post(path: String, body: B): T =
        json.decodeFromString(request("POST", path, json.encodeToString(body)))

    /** The backend reports errors as {"detail": "message"}. */
    private fun errorDetail(text: String): String? = try {
        (json.parseToJsonElement(text).jsonObject["detail"] as? JsonPrimitive)
            ?.takeIf { it.isString }
            ?.content
    } catch (e: Exception) {
        null
    }
}
