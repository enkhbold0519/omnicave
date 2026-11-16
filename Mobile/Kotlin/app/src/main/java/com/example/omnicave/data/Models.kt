package com.example.omnicave.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Shapes of the backend's JSON. Fields the app does not use are simply left out. */

@Serializable
data class User(
    val id: Int,
    val username: String,
    val email: String,
    @SerialName("display_name") val displayName: String? = null,
)

/** The name to show: the display name if one is set, otherwise the username. */
val User.shownName: String
    get() = displayName?.takeIf { it.isNotBlank() } ?: username

/** For the avatar: "Ada Lovelace" gives "AL", "test" gives "T". */
val User.initials: String
    get() {
        val parts = shownName.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
        val first = parts.firstOrNull()?.take(1).orEmpty()
        val last = if (parts.size > 1) parts.last().take(1) else ""
        return (first + last).uppercase().ifEmpty { "?" }
    }

/** Answer of GET /api/notifications. Only the unread count is used so far. */
@Serializable
data class NotificationList(val unread: Int = 0)

@Serializable
data class AuthResult(
    @SerialName("access_token") val accessToken: String,
    val user: User,
)

@Serializable
data class LoginRequest(val username: String, val password: String)

@Serializable
data class RegisterRequest(val username: String, val email: String, val password: String)
