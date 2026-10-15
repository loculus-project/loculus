package org.loculus.backend.utils

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.`is`
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.Test

class Base34Test {

    @Test
    fun `pads the encoded value up to the minimum length`() {
        assertThat(base34Encode(0, 4), `is`("0000"))
        assertThat(base34Encode(1, 4), `is`("0001"))
        assertThat(base34Encode(34, 4), `is`("0010"))
    }

    @Test
    fun `grows beyond the minimum length once the value no longer fits`() {
        val largestValueOfLengthFour = 34L * 34 * 34 * 34 - 1

        assertThat(base34Encode(largestValueOfLengthFour, 4), `is`("ZZZZ"))
        assertThat(base34Encode(largestValueOfLengthFour + 1, 4), `is`("10000"))
    }

    @Test
    fun `encodes digits with an alphabet that omits the ambiguous I and O`() {
        val allDigits = (0L until 34L).joinToString("") { base34Encode(it, 1) }

        assertThat(allDigits, `is`(CODE_POINTS))
        assertThat(allDigits, not(containsString("I")))
        assertThat(allDigits, not(containsString("O")))
    }
}
