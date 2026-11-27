package org.loculus.backend.utils

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test

class NulCharacterTest {
    @Test
    fun `short value is only made visible`() {
        assertThat("ab\u0000c".forErrorMessage(), equalTo("ab<NUL>c"))
    }

    @Test
    fun `value at the limit is not truncated`() {
        assertThat("a".repeat(100).forErrorMessage(), equalTo("a".repeat(100)))
    }

    @Test
    fun `long value is truncated`() {
        assertThat(("\u0000" + "a".repeat(10_000)).forErrorMessage(5), equalTo("<NUL>aaaa..."))
    }
}
