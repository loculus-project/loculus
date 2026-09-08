package org.loculus.backend.config

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.DEFAULT_ORGANISM

class BackendSpringConfigTest {

    @Test
    fun `GIVEN an empty config THEN the it is valid`() {
        val conf = backendConfig(emptyList(), EarliestReleaseDate(false, emptyList()))

        val errors = validateEarliestReleaseDateFields(conf)

        assertTrue(errors.isEmpty())
    }

    @Test
    fun `GIVEN a config with earliestReleaseDate configured with existing date fields THEN it is valid`() {
        val conf = backendConfig(
            listOf(
                Metadata("foo", MetadataType.DATE),
                Metadata("bar", MetadataType.DATE),
            ),
            EarliestReleaseDate(true, listOf("foo", "bar")),
        )

        val errors = validateEarliestReleaseDateFields(conf)

        assertTrue(errors.isEmpty())
    }

    @Test
    fun `GIVEN a config with a missing external field in earliestReleaseDate THEN it is invalid`() {
        val conf = backendConfig(
            listOf(
                Metadata("foo", MetadataType.DATE),
            ),
            EarliestReleaseDate(true, listOf("foo", "bar")),
        )

        val errors = validateEarliestReleaseDateFields(conf)

        assertThat(errors.size, `is`(1))
    }

    @Test
    fun `GIVEN a config with an external field with incorrect type in earliestReleaseDate THEN it is invalid`() {
        val conf = backendConfig(
            listOf(
                Metadata("foo", MetadataType.DATE),
                Metadata("bar", MetadataType.STRING),
            ),
            EarliestReleaseDate(true, listOf("foo", "bar")),
        )

        val errors = validateEarliestReleaseDateFields(conf)

        assertThat(errors.size, `is`(1))
    }

    @Test
    fun `GIVEN a file category with the same name as a metadata field THEN it is invalid`() {
        val conf = backendConfig(
            listOf(Metadata("rawReads", MetadataType.STRING)),
            EarliestReleaseDate(false, emptyList()),
        )

        val errors = validateFileCategoryNames(conf)

        assertThat(errors.size, `is`(1))
    }

    @Test
    fun `GIVEN a file category named like a key the backend adds itself THEN it is invalid`() {
        val conf = backendConfig(
            emptyList(),
            EarliestReleaseDate(false, emptyList()),
            fileCategories = listOf(FileCategory("submitter")),
        )

        val errors = validateFileCategoryNames(conf)

        assertThat(errors.size, `is`(1))
    }

    @Test
    fun `GIVEN a file category that does not clash with a metadata field THEN it is valid`() {
        val conf = backendConfig(
            listOf(Metadata("country", MetadataType.STRING)),
            EarliestReleaseDate(false, emptyList()),
        )

        val errors = validateFileCategoryNames(conf)

        assertTrue(errors.isEmpty())
    }
}

fun backendConfig(
    metadataList: List<Metadata>,
    earliestReleaseDate: EarliestReleaseDate,
    fileCategories: List<FileCategory> = listOf(FileCategory("rawReads")),
) = BackendConfig(
    organisms = mapOf(
        DEFAULT_ORGANISM to InstanceConfig(
            schema = Schema(
                DEFAULT_ORGANISM,
                metadataList,
                earliestReleaseDate = earliestReleaseDate,
                files = fileCategories,
                submissionDataTypes = SubmissionDataTypes(
                    files = FilesSubmissionDataType(enabled = true, categories = fileCategories),
                ),
            ),
            referenceGenome = ReferenceGenome(emptyList(), emptyList()),
        ),
    ),
    accessionPrefix = "FOO_",
    dataUseTerms = DataUseTerms(true, null),
    websiteUrl = "https://example.com",
    backendUrl = "http://foo.com",
)
