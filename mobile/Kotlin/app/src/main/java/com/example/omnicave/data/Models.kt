package com.example.omnicave.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.util.Locale
import kotlin.math.roundToLong

/** Shapes of the backend's JSON. Fields the app does not use are simply left out. */

@Serializable
data class User(
    val id: Int,
    val username: String,
    val email: String,
    @SerialName("display_name") val displayName: String? = null,
    val preferences: Preferences = Preferences(),
    /** When the daily briefing is sent, as "HH:MM". */
    @SerialName("briefing_time") val briefingTime: String = "08:00",
    @SerialName("email_verified") val emailVerified: Boolean = true,
    /** A new address waiting for its emailed code (email change). */
    @SerialName("pending_email") val pendingEmail: String? = null,
    /** Latest decision per consent: terms, privacy, overseas, marketing ("legacy" for old accounts). */
    val consents: Map<String, Boolean> = emptyMap(),
)

/** What the user likes to drink. The sommeliers use it when they recommend wines. */
@Serializable
data class Preferences(
    val styles: List<String> = emptyList(),
    val regions: List<String> = emptyList(),
    val grapes: List<String> = emptyList(),
    val likes: String = "",
    val dislikes: String = "",
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

/** Answer of GET /api/notifications: the newest 50 and how many of all are unread. */
@Serializable
data class NotificationList(val unread: Int = 0, val items: List<Notification> = emptyList())

/** [level] is "info", "warning" or "critical"; [createdAt] is in UTC. */
@Serializable
data class Notification(
    val id: Int,
    val kind: String = "",
    val level: String = "info",
    val message: String = "",
    val read: Int = 0,
    @SerialName("created_at") val createdAt: String = "",
)

@Serializable
data class AuthResult(
    @SerialName("access_token") val accessToken: String,
    val user: User,
)

@Serializable
data class LoginRequest(val username: String, val password: String)

@Serializable
data class RegisterRequest(
    val username: String,
    val email: String,
    val password: String,
    @SerialName("birth_date") val birthDate: String,
    val consents: Map<String, Boolean>,
)

/** Answer of sign-up: either a login ([user] set), or "enter the code we emailed to [email]". */
@Serializable
data class SignUpResult(
    @SerialName("verification_required") val verificationRequired: Boolean = false,
    val email: String = "",
    val user: User? = null,
)

/** One consent on the sign-up page (PIPA). [document] is "terms", "privacy" or null. */
@Serializable
data class Consent(val key: String, val required: Boolean, val title: String, val summary: String = "", val document: String? = null)

/** Answer of GET /api/legal: the consents and the full policy texts (Markdown). */
@Serializable
data class LegalInfo(val version: String = "", val consents: List<Consent> = emptyList(), val documents: Map<String, String> = emptyMap())

/** One of the user's cellars, from GET /api/cellars. */
@Serializable
data class CellarSummary(val id: Int, val name: String, @SerialName("bottle_count") val bottleCount: Int = 0)

@Serializable
data class Wine(
    val id: Int? = null,
    val name: String,
    val producer: String = "",
    val region: String? = null,
    /** "red", "white", "rose" or "sparkling". */
    val color: String = "red",
    val vintage: Int? = null,
    val country: String? = null,
    val grape: String? = null,
    @SerialName("drink_from") val drinkFrom: Int? = null,
    @SerialName("drink_to") val drinkTo: Int? = null,
    /** The purchase price in USD. */
    @SerialName("base_price") val basePrice: Double? = null,
)

/** "2019", or "NV" for a wine without a vintage. */
val Wine.vintageLabel: String
    get() = vintage?.takeIf { it > 0 }?.toString() ?: "NV"

/** A sommelier at the tasting table: one of the built-in ones, or the user's own. [color] is "#RRGGBB". */
@Serializable
data class Persona(
    val id: String,
    val name: String,
    val title: String = "",
    val color: String = "#4A4F55",
    @SerialName("built_in") val builtIn: Boolean = false,
    /** How the user's own sommelier judges. Built-in ones have [philosophy] only. */
    val traits: PersonaTraits? = null,
    val philosophy: String = "",
    /** What this sommelier has learned about the user at earlier tastings. */
    val memory: List<String> = emptyList(),
)

@Serializable
data class PersonaTraits(
    val scoring: String = "hundred",
    val focus: String = "everywhere",
    val loves: List<String> = listOf("elegance"),
    val strictness: Int = 3,
    val tone: String = "warm",
    val description: String = "",
)

@Serializable
data class Market(val price: Double = 0.0, @SerialName("change_12m") val change12m: Double = 0.0, val source: String = "")

/** Answer of GET /api/market/summary: what the whole collection is worth and how it moved in 12 months. */
@Serializable
data class MarketSummary(
    val total: Double = 0.0,
    @SerialName("change_12m") val change12m: Double = 0.0,
    val count: Int = 0,
    /** "simulated" while the prices are estimates. */
    val source: String = "",
    /** The value of the whole collection, one point per month for two years. */
    val history: List<ValuePoint> = emptyList(),
    /** Every bottle, most valuable first. */
    val bottles: List<ValueRow> = emptyList(),
)

@Serializable
data class ValuePoint(val date: String, val value: Double)

@Serializable
data class ValueRow(
    @SerialName("bottle_id") val bottleId: Int,
    val label: String = "",
    val price: Double = 0.0,
    @SerialName("change_12m") val change12m: Double = 0.0,
    val cellar: String = "",
)

@Serializable
data class Reading(val temp: Double, val hum: Double)

/** A climate zone of a cellar with its limits, latest reading and recent history. Heights are in cm from the floor. */
@Serializable
data class EnvZone(
    val id: Int,
    val name: String,
    @SerialName("y_from") val yFrom: Float = 0f,
    @SerialName("y_to") val yTo: Float = 0f,
    @SerialName("target_temp") val targetTemp: Double = 0.0,
    @SerialName("target_hum") val targetHum: Double = 0.0,
    @SerialName("temp_min") val tempMin: Double = 0.0,
    @SerialName("temp_max") val tempMax: Double = 0.0,
    @SerialName("hum_min") val humMin: Double = 0.0,
    @SerialName("hum_max") val humMax: Double = 0.0,
    /** How long a zone may stay outside its range before a notification is sent. */
    @SerialName("alert_minutes") val alertMinutes: Double = 15.0,
    val latest: Reading? = null,
    val history: List<Reading> = emptyList(),
    @SerialName("sensor_online") val sensorOnline: Boolean = true,
    @SerialName("in_range") val inRange: Boolean = true,
)

/** Answer of GET /api/cellars/{id}/environment. */
@Serializable
data class Environment(val zones: List<EnvZone> = emptyList())

@Serializable
data class Rack(
    val id: Int,
    val kind: String = "shelf",
    @SerialName("y_cm") val yCm: Float = 0f,
    @SerialName("depth_cm") val depthCm: Float = 50f,
)

/** One cellar with everything in it, from GET /api/cellars/{id}. Sizes are in cm. */
@Serializable
data class Cellar(
    val id: Int,
    val name: String,
    @SerialName("width_cm") val widthCm: Float,
    @SerialName("height_cm") val heightCm: Float,
    @SerialName("depth_cm") val depthCm: Float,
    val racks: List<Rack> = emptyList(),
    val bottles: List<Bottle> = emptyList(),
)

/** The climate zone a bottle lies in, with its latest sensor reading. */
@Serializable
data class BottleZone(val latest: Reading? = null)

@Serializable
data class PricePoint(val date: String, val price: Double)

/** Answer of GET /api/bottles/{id}/price-history. */
@Serializable
data class PriceHistory(val history: List<PricePoint> = emptyList())

/** One stored bottle, from GET /api/bottles. */
@Serializable
data class Bottle(
    val id: Int,
    @SerialName("cellar_id") val cellarId: Int,
    @SerialName("added_at") val addedAt: String = "",
    val wine: Wine,
    /** "ready", "young" or "past-peak". */
    @SerialName("window_status") val windowStatus: String = "young",
    @SerialName("cellar_name") val cellarName: String? = null,
    /** Where it lies, in words, for example "Rack 3 · 12 cm from left · front". */
    val location: String = "",
    /** Position in cm: x from the left wall, y from the floor, z from the door. */
    val x: Float = 0f,
    val y: Float = 0f,
    val z: Float = 0f,
    val orientation: String = "lying",
    val level: Int = 0,
    val layer: String = "front",
    val source: String = "manual",
    val confidence: Double? = null,
    val market: Market = Market(),
    /** Only present when a single bottle is requested. */
    val zone: BottleZone? = null,
)

/** Bottles with the same key are the same wine and vintage. */
val Bottle.wineKey: String
    get() = wine.id?.let { "w$it" } ?: "${wine.producer}|${wine.name}|${wine.vintage}"

/** "rose" gives "Rosé". */
fun styleName(color: String): String = when (color) {
    "rose" -> "Rosé"
    else -> color.replaceFirstChar { it.uppercase() }
}

/** 1234.5 gives "$1,235". */
fun money(value: Double): String = "$" + "%,d".format(Locale.US, value.roundToLong())

/** 4.25 gives "+4.3%". */
fun percent(value: Double): String = "%+.1f%%".format(Locale.US, value)
