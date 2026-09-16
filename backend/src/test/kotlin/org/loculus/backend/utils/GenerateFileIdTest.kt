package org.loculus.backend.utils

import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Test
import java.lang.Math.random
import kotlin.math.pow

class GenerateFileIdTest {

    @Test
    fun `GIVEN sequence numbers THEN returns file ids that are padded to 6 digits with a check character`() {
        val sequenceNumbers: List<Long> = listOf(
            1,
            1 * 34.0.pow(1.0).toLong() + 3,
            3 * 34.0.pow(2.0).toLong() + 2 * 34.0.pow(1.0).toLong() + 1,
        )

        val expectedFileIds = listOf(
            "FILE_000001Y",
            "FILE_000013T",
            "FILE_000321Q",
        )

        val result = sequenceNumbers.map { generateFileId(it) }

        assertThat(result, `is`(expectedFileIds))
    }

    @Test
    fun `GIVEN large sequence numbers THEN returns longer file ids`() {
        val sequenceNumber: Long = 34.0.pow(6.0).toLong() + 1

        assertThat(generateFileId(sequenceNumber), `is`("FILE_1000001W"))
    }

    @Test
    fun `GIVEN a valid file id THEN the validation succeeds`() {
        val sequenceNumber = (random() * 1e6).toLong()

        val fileId = generateFileId(sequenceNumber)

        assertThat(validateFileId(fileId), `is`(true))
    }

    @Test
    fun `GIVEN a file id without prefix THEN the validation fails`() {
        val sequenceNumber = (random() * 1e6).toLong()

        val fileIdWithoutPrefix = generateFileId(sequenceNumber).removePrefix("FILE_")

        assertThat(validateFileId(fileIdWithoutPrefix), `is`(false))
    }

    @Test
    fun `GIVEN an invalid file id THEN the validation fails`() {
        val invalidFileId = "FILE_Not a valid file id"

        assertThat(validateFileId(invalidFileId), `is`(false))
    }
}
