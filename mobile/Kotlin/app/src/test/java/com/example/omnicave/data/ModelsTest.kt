package com.example.omnicave.data

import org.junit.Assert.assertEquals
import org.junit.Test

class ModelsTest {

    @Test
    fun shownNameUsesDisplayNameWhenAvailable() {
        val user = User(
            id = 1,
            username = "junhan",
            email = "jun@example.com",
            displayName = "Jun Han"
        )

        assertEquals("Jun Han", user.shownName)
    }

    @Test
    fun shownNameFallsBackToUsername() {
        val user = User(
            id = 1,
            username = "junhan",
            email = "jun@example.com"
        )

        assertEquals("junhan", user.shownName)
    }

    @Test
    fun initialsUsesFirstAndLastNames() {
        val user = User(
            id = 1,
            username = "junhan",
            email = "jun@example.com",
            displayName = "Jun Han"
        )

        assertEquals("JH", user.initials)
    }

    @Test
    fun initialsUsesUsernameWhenDisplayNameIsBlank() {
        val user = User(
            id = 1,
            username = "junhan",
            email = "jun@example.com",
            displayName = " "
        )

        assertEquals("J", user.initials)
    }

    @Test
    fun vintageLabelUsesVintageWhenAvailable() {
        val wine = Wine(name = "Test Wine", vintage = 2019)

        assertEquals("2019", wine.vintageLabel)
    }

    @Test
    fun vintageLabelUsesNVWhenVintageIsMissing() {
        val wine = Wine(name = "Non Vintage Wine")

        assertEquals("NV", wine.vintageLabel)
    }

    @Test
    fun vintageLabelUsesNVForInvalidVintage() {
        val wine = Wine(name = "Test Wine", vintage = 0)

        assertEquals("NV", wine.vintageLabel)
    }

    @Test
    fun styleNameFormatsRose() {
        assertEquals("Ros" + 0xE9.toChar(), styleName("rose"))
    }

    @Test
    fun styleNameCapitalizesOtherColours() {
        assertEquals("Red", styleName("red"))
        assertEquals("White", styleName("white"))
    }

    @Test
    fun moneyFormatsCurrency() {
        assertEquals("$1,235", money(1234.5))
    }

    @Test
    fun percentFormatsPositiveAndNegativeValues() {
        assertEquals("+4.3%", percent(4.25))
        assertEquals("-2.5%", percent(-2.5))
    }
}