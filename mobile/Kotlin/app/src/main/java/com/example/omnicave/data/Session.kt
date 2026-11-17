package com.example.omnicave.data

import android.content.Context

/** Keeps the login token on the phone so the user stays logged in after closing the app. */
class Session(context: Context) {
    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) {
            val editor = prefs.edit()
            if (value == null) editor.remove(KEY_TOKEN) else editor.putString(KEY_TOKEN, value)
            editor.apply()
        }

    private companion object {
        const val KEY_TOKEN = "token"
    }
}
