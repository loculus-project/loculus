package org.loculus.backend.query.index

import com.google.re2j.Pattern
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.notNullValue
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Test
import kotlin.random.Random

class LiteralPatternTest {
    /** what the website sends for a free-text search (SequenceFilters.tsx makeCaseInsensitiveLiteralSubstringRegex) */
    private fun websiteRegex(s: String) = "(?i)" + s.replace(Regex("""[.*+?^${'$'}{}()|\[\]\\]""")) { "\\" + it.value }

    @Test
    fun `recognises escaped literals only`() {
        assertThat(LiteralPattern.parse(websiteRegex("OQ.123 (x)")), notNullValue())
        assertThat(LiteralPattern.parse("abc"), notNullValue())
        assertThat(LiteralPattern.parse("(?i)"), notNullValue())
        for (pattern in listOf("a.c", "^abc", "abc$", "a|b", "(?i)a[bc]", "\\d", "a\\", "(?i)ä", "(?s)abc", "x{2}")) {
            assertThat(pattern, LiteralPattern.parse(pattern), nullValue())
        }
    }

    @Test
    fun `agrees with RE2J`() {
        val alphabet = "aAbBiIkKsSxX19 .-_()KſİıäÄ"
        val random = Random(7)
        fun randomString(maxLength: Int) = (0 until random.nextInt(maxLength + 1))
            .map { alphabet[random.nextInt(alphabet.length)] }.joinToString("")
        repeat(20_000) {
            val needle = randomString(3).filter { it.code < 128 }
            val value = randomString(8)
            for (pattern in listOf(websiteRegex(needle), needle.replace(Regex("""[.()\\]""")) { "\\" + it.value })) {
                val literal = LiteralPattern.parse(pattern)!!
                assertThat(
                    "'$pattern' in '$value'",
                    literal.foundIn(value),
                    equalTo(Pattern.compile(pattern).matcher(value).find()),
                )
            }
        }
    }
}
