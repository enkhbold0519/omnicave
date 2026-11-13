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

@Serializable
data class AuthResult(
    @SerialName("access_token") val accessToken: String,
    val user: User,
)

@Serializable
data class LoginRequest(val username: String, val password: String)

@Serializable
data class RegisterRequest(val username: String, val email: String, val password: String)
