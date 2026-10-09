package org.loculus.backend.utils

import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
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

    companion object {
        data class FileIdCase(val description: String, val fileId: String, val expectedValidationResult: Boolean) {
            override fun toString() = description
        }

        @JvmStatic
        fun invalidFileIdCases(): List<FileIdCase> = listOf(
            FileIdCase(
                description = "a non-alphanumeric garbage string",
                fileId = "FILE_Not a valid file id",
                expectedValidationResult = false,
            ),
            FileIdCase(
                description = "a single-character typo in an otherwise valid id",
                fileId = "FILE_000002Y",
                expectedValidationResult = false,
            ),
            FileIdCase(
                description = "two adjacent characters transposed",
                fileId = "FILE_000031T",
                expectedValidationResult = false,
            ),
            FileIdCase(
                description = "a character outside the alphabet",
                fileId = "FILE_2ZI",
                expectedValidationResult = false,
            ),
            FileIdCase(
                description = "an empty serial part",
                fileId = "FILE_",
                expectedValidationResult = false,
            ),
            FileIdCase(
                description = "an old-format file id without a check character",
                fileId = "FILE_2K7Q",
                // Old-format ids predate the check character and are not specially recognized,
                // so they are not backward-compatible with the current validation.
                expectedValidationResult = false,
            ),
        )
    }

    @ParameterizedTest(name = "GIVEN {0} THEN validation returns the expected result")
    @MethodSource("invalidFileIdCases")
    fun `GIVEN a potentially invalid file id THEN the validation returns the expected result`(case: FileIdCase) {
        assertThat(validateFileId(case.fileId), `is`(case.expectedValidationResult))
    }
}
