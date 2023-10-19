package org.pathoplexus.backend.controller

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles.firstSequence
import org.pathoplexus.backend.service.Insertion
import org.pathoplexus.backend.service.Status
import org.pathoplexus.backend.service.SubmittedProcessedData
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class SubmitProcessedDataEndpointTest(
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {
    @Test
    fun `WHEN I submit successfully preprocessed data THEN the sequence is in status processed`() {
        prepareExtractedSequencesInDatabase()

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(sequenceId = 3),
            PreparedProcessedData.successfullyProcessed(sequenceId = 4),
        )
            .andExpect(status().isOk)

        convenienceClient.getSequenceVersionOfUser(sequenceId = 3, version = 1).assertStatusIs(Status.PROCESSED)
    }

    @Test
    fun `WHEN I submit preprocessed data without insertions THEN the missing keys of the reference will be added`() {
        prepareExtractedSequencesInDatabase()

        val dataWithoutInsertions = PreparedProcessedData.successfullyProcessed().data.withValues(
            nucleotideInsertions = mapOf("main" to listOf(Insertion(1, "A"))),
            aminoAcidInsertions = emptyMap(),
        )

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(sequenceId = 3).withValues(data = dataWithoutInsertions),
        ).andExpect(status().isOk)

        convenienceClient.getSequenceVersionOfUser(sequenceId = 3, version = 1).assertStatusIs(Status.PROCESSED)

        submissionControllerClient.getSequenceThatNeedsReview(sequenceId = 3, version = 1, userName = USER_NAME)
            .andExpect(status().isOk)
            .andExpect(
                jsonPath("\$.processedData.nucleotideInsertions")
                    .value(mapOf("main" to listOf(Insertion(1, "A").toString()), "secondSegment" to emptyList())),
            )
            .andExpect(
                jsonPath("\$.processedData.aminoAcidInsertions")
                    .value(mapOf("someShortGene" to emptyList<String>(), "someLongGene" to emptyList())),
            )
    }

    @Test
    fun `WHEN I submit null for a non-required field THEN the sequence is in status processed`() {
        prepareExtractedSequencesInDatabase()

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withNullForFields(fields = listOf("dateSubmitted")),
        )
            .andExpect(status().isOk)

        prepareExtractedSequencesInDatabase()

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.PROCESSED)
    }

    @Test
    fun `WHEN I submit data with errors THEN the sequence is in status needs review`() {
        prepareExtractedSequencesInDatabase()

        submissionControllerClient.submitProcessedData(PreparedProcessedData.withErrors(firstSequence))
            .andExpect(status().isOk)

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.NEEDS_REVIEW)
    }

    @Test
    fun `GIVEN I submitted invalid data and errors THEN the sequence is in status needs review`() {
        convenienceClient.submitDefaultFiles()
        convenienceClient.extractUnprocessedData(1)
        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withWrongDateFormat().withValues(
                sequenceId = firstSequence,
                errors = PreparedProcessedData.withErrors().errors,
            ),
        ).andExpect(status().isOk)

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.NEEDS_REVIEW)
    }

    @Test
    fun `WHEN I submit data with warnings THEN the sequence is in status processed`() {
        prepareExtractedSequencesInDatabase()

        submissionControllerClient.submitProcessedData(PreparedProcessedData.withWarnings(firstSequence))
            .andExpect(status().isOk)

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.PROCESSED)
    }

    @ParameterizedTest(name = "{arguments}")
    @MethodSource("provideInvalidDataScenarios")
    fun `GIVEN invalid processed data THEN refuses to update and an error will be thrown`(
        invalidDataScenario: InvalidDataScenario,
    ) {
        prepareExtractedSequencesInDatabase()

        submissionControllerClient.submitProcessedData(invalidDataScenario.processedData)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.detail").value(invalidDataScenario.expectedErrorMessage))

        val sequenceStatus = convenienceClient.getSequenceVersionOfUser(
            sequenceId = invalidDataScenario.processedData.sequenceId,
            version = 1,
        )
        assertThat(sequenceStatus.status, `is`(Status.PROCESSING))
    }

    @Test
    fun `WHEN I submit data for a non-existent sequence id THEN refuses update with unprocessable entity`() {
        prepareExtractedSequencesInDatabase()

        val nonExistentSequenceId = 999L

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(sequenceId = 1),
            PreparedProcessedData.successfullyProcessed(sequenceId = nonExistentSequenceId),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.detail").value("Sequence version $nonExistentSequenceId.1 does not exist"))

        convenienceClient.getSequenceVersionOfUser(sequenceId = 1, version = 1).assertStatusIs(Status.PROCESSING)
    }

    @Test
    fun `WHEN I submit data for a non-existent sequence version THEN refuses update with unprocessable entity`() {
        prepareExtractedSequencesInDatabase()

        val nonExistentVersion = 999L

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(sequenceId = firstSequence),
            PreparedProcessedData.successfullyProcessed(sequenceId = firstSequence)
                .withValues(version = nonExistentVersion),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Sequence version $firstSequence.$nonExistentVersion does not exist",
                ),
            )

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.PROCESSING)
    }

    @Test
    fun `WHEN I submit data for a sequence that is not in processing THEN refuses update with unprocessable entity`() {
        convenienceClient.submitDefaultFiles()
        convenienceClient.extractUnprocessedData(1)

        val sequenceIdNotInProcessing: Long = 2
        convenienceClient.getSequenceVersionOfUser(sequenceId = sequenceIdNotInProcessing, version = 1)
            .assertStatusIs(Status.RECEIVED)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(sequenceId = firstSequence),
            PreparedProcessedData.successfullyProcessed(sequenceId = sequenceIdNotInProcessing),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Sequence version $sequenceIdNotInProcessing.1 is in not in state PROCESSING (was RECEIVED)",
                ),
            )

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.PROCESSING)
        convenienceClient.getSequenceVersionOfUser(sequenceId = sequenceIdNotInProcessing, version = 1)
            .assertStatusIs(Status.RECEIVED)
    }

    @Test
    fun `WHEN I submit a JSON entry with a missing field THEN returns bad request`() {
        convenienceClient.submitDefaultFiles()
        convenienceClient.extractUnprocessedData(1)

        submissionControllerClient.submitProcessedDataRaw(
            """
                {
                    "sequenceId": 1,
                    "version": 1,
                    "data": {
                        "noMetadata": null,
                        "unalignedNucleotideSequences": {
                            "main": "NNNNNN"
                        }
                    }
                }
            """.replace(Regex("\\s"), ""),
        )
            .andExpect(status().isBadRequest)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.detail").value(containsString("Failed to deserialize NDJSON")))
            .andExpect(jsonPath("\$.detail").value(containsString("failed for JSON property metadata")))
    }

    private fun prepareExtractedSequencesInDatabase() {
        convenienceClient.submitDefaultFiles()
        convenienceClient.extractUnprocessedData()
    }

    companion object {
        @JvmStatic
        fun provideInvalidDataScenarios() =
            provideInvalidMetadataScenarios() +
                provideInvalidNucleotideSequenceDataScenarios() +
                provideInvalidAminoAcidSequenceDataScenarios()

        @JvmStatic
        fun provideInvalidMetadataScenarios() = listOf(
            InvalidDataScenario(
                name = "data with unknown metadata fields",
                processedData = PreparedProcessedData.withUnknownMetadataField(
                    fields = listOf(
                        "unknown field 1",
                        "unknown field 2",
                    ),
                ),
                expectedErrorMessage = "Unknown fields in processed data: unknown field 1, unknown field 2.",
            ),
            InvalidDataScenario(
                name = "data with missing required fields",
                processedData = PreparedProcessedData.withMissingRequiredField(fields = listOf("date", "region")),
                expectedErrorMessage = "Missing the required field 'date'.",
            ),
            InvalidDataScenario(
                name = "data with wrong type for fields",
                processedData = PreparedProcessedData.withWrongTypeForFields(),
                expectedErrorMessage = "Expected type 'string' for field 'region', found value '5'.",
            ),
            InvalidDataScenario(
                name = "data with wrong date format",
                processedData = PreparedProcessedData.withWrongDateFormat(),
                expectedErrorMessage =
                "Expected type 'date' in format 'yyyy-MM-dd' for field 'date', found value '\"1.2.2021\"'.",
            ),
            InvalidDataScenario(
                name = "data with wrong pango lineage format",
                processedData = PreparedProcessedData.withWrongPangoLineageFormat(),
                expectedErrorMessage =
                "Expected type 'pango_lineage' for field 'pangoLineage', found value '\"A.5.invalid\"'. " +
                    "A pango lineage must be of the form [a-zA-Z]{1,3}(\\.\\d{1,3}){0,3}, e.g. 'XBB' or 'BA.1.5'.",
            ),
            InvalidDataScenario(
                name = "data with explicit null for required field",
                processedData = PreparedProcessedData.withNullForFields(fields = listOf("date")),
                expectedErrorMessage = "Field 'date' is null, but a value is required.",
            ),
        )

        @JvmStatic
        fun provideInvalidNucleotideSequenceDataScenarios() = listOf(
            InvalidDataScenario(
                name = "data with missing segment in unaligned nucleotide sequences",
                processedData = PreparedProcessedData.withMissingSegmentInUnalignedNucleotideSequences(
                    segment = "main",
                ),
                expectedErrorMessage = "Missing the required segment 'main' in 'unalignedNucleotideSequences'.",
            ),
            InvalidDataScenario(
                name = "data with missing segment in aligned nucleotide sequences",
                processedData = PreparedProcessedData.withMissingSegmentInAlignedNucleotideSequences(segment = "main"),
                expectedErrorMessage = "Missing the required segment 'main' in 'alignedNucleotideSequences'.",
            ),
            InvalidDataScenario(
                name = "data with unknown segment in alignedNucleotideSequences",
                processedData = PreparedProcessedData.withUnknownSegmentInAlignedNucleotideSequences(
                    segment = "someOtherSegment",
                ),
                expectedErrorMessage = "Unknown segments in 'alignedNucleotideSequences': someOtherSegment.",
            ),
            InvalidDataScenario(
                name = "data with unknown segment in unalignedNucleotideSequences",
                processedData = PreparedProcessedData.withUnknownSegmentInUnalignedNucleotideSequences(
                    segment = "someOtherSegment",
                ),
                expectedErrorMessage = "Unknown segments in 'unalignedNucleotideSequences': someOtherSegment.",
            ),
            InvalidDataScenario(
                name = "data with unknown segment in nucleotideInsertions",
                processedData = PreparedProcessedData.withUnknownSegmentInNucleotideInsertions(
                    segment = "someOtherSegment",
                ),
                expectedErrorMessage = "Unknown segments in 'nucleotideInsertions': someOtherSegment.",
            ),
            InvalidDataScenario(
                name = "data with segment in aligned nucleotide sequences of wrong length",
                processedData = PreparedProcessedData.withAlignedNucleotideSequenceOfWrongLength(segment = "main"),
                expectedErrorMessage = "The length of 'main' in 'alignedNucleotideSequences' is 123, " +
                    "but it should be 49.",
            ),
            InvalidDataScenario(
                name = "data with segment in aligned nucleotide sequences with wrong symbols",
                processedData = PreparedProcessedData.withAlignedNucleotideSequenceWithWrongSymbols(segment = "main"),
                expectedErrorMessage = "The sequence of segment 'main' in 'alignedNucleotideSequences' contains " +
                    "invalid symbols: [Ä, Ö].",
            ),
            InvalidDataScenario(
                name = "data with segment in unaligned nucleotide sequences with wrong symbols",
                processedData = PreparedProcessedData.withUnalignedNucleotideSequenceWithWrongSymbols(segment = "main"),
                expectedErrorMessage = "The sequence of segment 'main' in 'unalignedNucleotideSequences' contains " +
                    "invalid symbols: [Ä, Ö].",
            ),
            InvalidDataScenario(
                name = "data with segment in nucleotide insertions with wrong symbols",
                processedData = PreparedProcessedData.withNucleotideInsertionsWithWrongSymbols(segment = "main"),
                expectedErrorMessage = "The insertion 123:ÄÖ of segment 'main' in 'nucleotideInsertions' contains " +
                    "invalid symbols: [Ä, Ö].",
            ),
        )

        @JvmStatic
        fun provideInvalidAminoAcidSequenceDataScenarios() = listOf(
            InvalidDataScenario(
                name = "data with missing gene in aminoAcidSequences",
                processedData = PreparedProcessedData.withMissingGeneInAminoAcidSequences(
                    gene = "someShortGene",
                ),
                expectedErrorMessage = "Missing the required gene 'someShortGene'.",
            ),
            InvalidDataScenario(
                name = "data with unknown gene in aminoAcidSequences",
                processedData = PreparedProcessedData.withUnknownGeneInAminoAcidSequences(
                    gene = "someOtherGene",
                ),
                expectedErrorMessage = "Unknown genes in 'aminoAcidSequences': someOtherGene.",
            ),
            InvalidDataScenario(
                name = "data with unknown gene in aminoAcidInsertions",
                processedData = PreparedProcessedData.withUnknownGeneInAminoAcidInsertions(
                    gene = "someOtherGene",
                ),
                expectedErrorMessage = "Unknown genes in 'aminoAcidInsertions': someOtherGene.",
            ),
            InvalidDataScenario(
                name = "data with gene in aminoAcidSequences of wrong length",
                processedData = PreparedProcessedData.withAminoAcidSequenceOfWrongLength(gene = "someShortGene"),
                expectedErrorMessage = "The length of 'someShortGene' in 'aminoAcidSequences' is 123, " +
                    "but it should be 4.",
            ),
            InvalidDataScenario(
                name = "data with gene in aminoAcidSequences with wrong symbols",
                processedData = PreparedProcessedData.withAminoAcidSequenceWithWrongSymbols(gene = "someShortGene"),
                expectedErrorMessage = "The gene 'someShortGene' in 'aminoAcidSequences' contains invalid symbols: " +
                    "[Ä, Ö].",
            ),
            InvalidDataScenario(
                name = "data with segment in amino acid insertions with wrong symbols",
                processedData = PreparedProcessedData.withAminoAcidInsertionsWithWrongSymbols(gene = "someShortGene"),
                expectedErrorMessage = "An insertion of gene 'someShortGene' in 'aminoAcidInsertions' contains " +
                    "invalid symbols: [Ä, Ö].",
            ),
        )
    }
}

data class InvalidDataScenario(
    val name: String,
    val processedData: SubmittedProcessedData,
    val expectedErrorMessage: String,
) {
    override fun toString(): String {
        return "GIVEN $name THEN the response contains $expectedErrorMessage"
    }
}
