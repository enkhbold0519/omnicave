package com.example.omnicave.data

import com.example.omnicave.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/** A failed request. [status] is the HTTP code, or 0 when the server could not be reached. */
class ApiException(val status: Int, message: String) : Exception(message)

/** The one place that talks to the backend. Every screen goes through here. */
object Api {
    /** Sent as "Authorization: Bearer ..." on every request once the user is logged in. */
    var token: String? = null

    val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true // a null where a default exists becomes the default
    }

    private val client = OkHttpClient()
    private val jsonType = "application/json".toMediaType()

    /**
     * Called when the server rejects the saved login (HTTP 401) on any request,
     * so the app can go back to Log in. Set once by the app's root.
     */
    var onUnauthorized: (() -> Unit)? = null

    /** Sends one request and returns the response text, or throws [ApiException]. */
    suspend fun request(method: String, path: String, body: String? = null): String =
        try {
            send(method, path, body)
        } catch (e: ApiException) {
            // A wrong password at Log in is also a 401, but no token is set yet then.
            if (e.status == 401 && token != null) onUnauthorized?.invoke()
            throw e
        }

    private suspend fun send(method: String, path: String, body: String?): String =
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

    suspend inline fun <reified T> get(path: String): T = decode(request("GET", path))

    suspend inline fun <reified T, reified B> post(path: String, body: B): T =
        decode(request("POST", path, json.encodeToString(body)))

    /** Turns the JSON text into Kotlin objects. An answer in an unexpected shape becomes an error message, not a crash. */
    inline fun <reified T> decode(text: String): T = try {
        json.decodeFromString(text)
    } catch (e: SerializationException) {
        throw ApiException(-1, "Unexpected answer from the server")
    }

    // The AI answers can pause between words, so streaming waits longer for the next piece.
    private val streamClient = client.newBuilder().readTimeout(60, TimeUnit.SECONDS).build()

    /**
     * For the AI endpoints, which answer piece by piece (Server-Sent Events): each "data: {...}" line
     * the server sends is handed on as one event while the answer is still being written.
     */
    fun stream(path: String, body: String): Flow<JsonObject> = flow {
        val builder = Request.Builder().url(BuildConfig.API_BASE + path).post(body.toRequestBody(jsonType))
        token?.let { builder.header("Authorization", "Bearer $it") }
        val response = try {
            streamClient.newCall(builder.build()).execute()
        } catch (e: IOException) {
            throw ApiException(0, "Can't reach the server")
        }
        response.use {
            if (!it.isSuccessful) {
                throw ApiException(it.code, errorDetail(it.body?.string().orEmpty()) ?: "Request failed (${it.code})")
            }
            val source = it.body?.source() ?: return@use
            while (true) {
                val line = try {
                    source.readUtf8Line()
                } catch (e: IOException) {
                    throw ApiException(0, "The connection was lost")
                } ?: break
                if (line.startsWith("data:")) {
                    (runCatching { json.parseToJsonElement(line.substring(5)) }.getOrNull() as? JsonObject)?.let { event -> emit(event) }
                }
            }
        }
    }.flowOn(Dispatchers.IO)

    /** The backend reports errors as {"detail": "message"}. */
    private fun errorDetail(text: String): String? = try {
        (json.parseToJsonElement(text).jsonObject["detail"] as? JsonPrimitive)
            ?.takeIf { it.isString }
            ?.content
    } catch (e: Exception) {
        null
    }
}

/** A text field of a stream event, or "" when it is missing. */
fun JsonObject.text(key: String): String = (this[key] as? JsonPrimitive)?.content.orEmpty()
