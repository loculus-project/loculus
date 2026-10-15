package org.loculus.backend.utils

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test

class UniqueIdsTest {

    @Test
    fun `keeps unique ids unchanged`() {
        val ids = listOf("sample", "sample_1", "other")

        assertThat(makeUniqueIds(ids), `is`(ids))
    }

    @Test
    fun `adds suffixes to duplicate ids`() {
        assertThat(
            makeUniqueIds(listOf("sample", "sample", "sample")),
            `is`(listOf("sample", "sample_1", "sample_2")),
        )
    }

    @Test
    fun `skips suffixes that would clash with original ids`() {
        assertThat(
            makeUniqueIds(listOf("sample", "sample", "sample_1", "sample")),
            `is`(listOf("sample", "sample_2", "sample_1", "sample_3")),
        )
    }

    @Test
    fun `deduplicates independently per original id`() {
        assertThat(
            makeUniqueIds(listOf("sample", "other", "sample", "other")),
            `is`(listOf("sample", "other", "sample_1", "other_1")),
        )
    }
}
