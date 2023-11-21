package org.pathoplexus.backend.controller

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Disabled
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.pathoplexus.backend.api.Insertion
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.api.SubmittedProcessedData
import org.pathoplexus.backend.api.UnprocessedData
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles.firstAccession
import org.pathoplexus.backend.service.AminoAcidSymbols
import org.pathoplexus.backend.service.NucleotideSymbols
import org.pathoplexus.backend.utils.Accession
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
    @Disabled("TODO(#607) reactivate")
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            submissionControllerClient.submitProcessedData(
                PreparedProcessedData.successfullyProcessed(),
                jwt = it,
            )
        }
    }

    // TODO(#607): delete
    @Test
    fun `GIVEN no access token THEN access is allowed`() {
        submissionControllerClient
            .submitProcessedData(
                PreparedProcessedData.successfullyProcessed(),
                jwt = null,
            )
            .andExpect(status().isUnprocessableEntity)
    }

    @Test
    fun `WHEN I submit successfully preprocessed data THEN the sequence entry is in status processed`() {
        prepareExtractedSequencesInDatabase()

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = "3"),
            PreparedProcessedData.successfullyProcessed(accession = "4"),
        )
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = "3", version = 1).assertStatusIs(
            Status.AWAITING_APPROVAL,
        )
    }

    @Test
    fun `WHEN I submit with all valid symbols THEN the sequence entry is in status processed`() {
        prepareExtractedSequencesInDatabase()

        val allNucleotideSymbols = NucleotideSymbols.entries.joinToString("") { it.symbol.toString() }
        val allAminoAcidSymbols = AminoAcidSymbols.entries.joinToString("") { it.symbol.toString() }
        val defaultData = PreparedProcessedData.successfullyProcessed().data

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = "3").withValues(
                data = defaultData.withValues(
                    unalignedNucleotideSequences = defaultData.unalignedNucleotideSequences +
                        ("secondSegment" to allNucleotideSymbols),
                    alignedNucleotideSequences = defaultData.alignedNucleotideSequences +
                        ("secondSegment" to allNucleotideSymbols),
                    alignedAminoAcidSequences =
                    defaultData.alignedAminoAcidSequences + ("someLongGene" to allAminoAcidSymbols),
                ),
            ),
        )
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = "3", version = 1).assertStatusIs(
            Status.AWAITING_APPROVAL,
        )
    }

    @Test
    fun `WHEN I submit preprocessed data without insertions THEN the missing keys of the reference will be added`() {
        prepareExtractedSequencesInDatabase()

        val dataWithoutInsertions = PreparedProcessedData.successfullyProcessed().data.withValues(
            nucleotideInsertions = mapOf("main" to listOf(Insertion(1, "A"))),
            aminoAcidInsertions = emptyMap(),
        )

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = "3").withValues(data = dataWithoutInsertions),
        ).andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = "3", version = 1).assertStatusIs(
            Status.AWAITING_APPROVAL,
        )

        submissionControllerClient.getSequenceEntryThatHasErrors(accession = "3", version = 1)
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
    fun `WHEN I submit null for a non-required field THEN the sequence entry is in status processed`() {
        prepareExtractedSequencesInDatabase()

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withNullForFields(fields = listOf("dateSubmitted")),
        )
            .andExpect(status().isNoContent)

        prepareExtractedSequencesInDatabase()

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.AWAITING_APPROVAL)
    }

    @Test
    fun `WHEN I submit data with errors THEN the sequence entry is in status has errors`() {
        prepareExtractedSequencesInDatabase()

        submissionControllerClient.submitProcessedData(PreparedProcessedData.withErrors(firstAccession))
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)
    }

    @Test
    fun `GIVEN I submitted invalid data and errors THEN the sequence entry is in status has errors`() {
        convenienceClient.submitDefaultFiles()
        convenienceClient.extractUnprocessedData(1)
        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withWrongDateFormat().withValues(
                accession = firstAccession,
                errors = PreparedProcessedData.withErrors().errors,
            ),
        ).andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)
    }

    @Test
    fun `WHEN I submit data with warnings THEN the sequence entry is in status processed`() {
        prepareExtractedSequencesInDatabase()

        submissionControllerClient.submitProcessedData(PreparedProcessedData.withWarnings(firstAccession))
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.AWAITING_APPROVAL)
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

        val sequenceStatus = convenienceClient.getSequenceEntryOfUser(
            accession = invalidDataScenario.processedData.accession,
            version = 1,
        )
        assertThat(sequenceStatus.status, `is`(Status.IN_PROCESSING))
    }

    @Test
    fun `WHEN I submit data for a non-existent accession THEN refuses update with unprocessable entity`() {
        prepareExtractedSequencesInDatabase()

        val nonExistentAccesion = "999"

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = "1"),
            PreparedProcessedData.successfullyProcessed(accession = nonExistentAccesion),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.detail").value("Accession version $nonExistentAccesion.1 does not exist"))

        convenienceClient.getSequenceEntryOfUser(accession = "1", version = 1).assertStatusIs(Status.IN_PROCESSING)
    }

    @Test
    fun `WHEN I submit data for a non-existent accession version THEN refuses update with unprocessable entity`() {
        prepareExtractedSequencesInDatabase()

        val nonExistentVersion = 999L

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = firstAccession),
            PreparedProcessedData.successfullyProcessed(accession = firstAccession)
                .withValues(version = nonExistentVersion),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession version $firstAccession.$nonExistentVersion does not exist",
                ),
            )

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.IN_PROCESSING)
    }

    @Test
    fun `WHEN I submit data for an entry that is not in processing THEN refuses update with unprocessable entity`() {
        val accession = prepareUnprocessedSequenceEntry()

        val accessionNotInProcessing = "2"
        convenienceClient.getSequenceEntryOfUser(accession = accessionNotInProcessing, version = 1)
            .assertStatusIs(Status.RECEIVED)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accession),
            PreparedProcessedData.successfullyProcessed(accession = accessionNotInProcessing),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession version $accessionNotInProcessing.1 is in not in state IN_PROCESSING (was RECEIVED)",
                ),
            )

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.IN_PROCESSING)
        convenienceClient.getSequenceEntryOfUser(accession = accessionNotInProcessing, version = 1)
            .assertStatusIs(Status.RECEIVED)
    }

    @Test
    fun `WHEN I submit a JSON entry with a missing field THEN returns bad request`() {
        val accession = prepareUnprocessedSequenceEntry()

        submissionControllerClient.submitProcessedDataRaw(
            """
                {
                    "accession": $accession,
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

    @Test
    fun `WHEN I submit an entry with the wrong organism THEN refuses update with unprocessable entity`() {
        val accession = prepareUnprocessedSequenceEntry(DEFAULT_ORGANISM)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accession),
            organism = OTHER_ORGANISM,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(containsString("1.1 is for organism dummyOrganism")),
            )
            .andExpect(
                jsonPath("\$.detail").value(containsString("submitted data is for organism otherOrganism")),
            )
    }

    @Test
    fun `WHEN I submit an entry organism THEN requires the schema of the given organism`() {
        val defaultOrganismAccession = prepareUnprocessedSequenceEntry(DEFAULT_ORGANISM)
        val otherOrganismAccession = prepareUnprocessedSequenceEntry(OTHER_ORGANISM)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessedOtherOrganismData(accession = defaultOrganismAccession),
            organism = DEFAULT_ORGANISM,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(
                jsonPath("\$.detail").value("Unknown fields in processed data: specialOtherField."),
            )

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessedOtherOrganismData(accession = otherOrganismAccession),
            organism = OTHER_ORGANISM,
        )
            .andExpect(status().isNoContent)
    }

    private fun prepareUnprocessedSequenceEntry(organism: String = DEFAULT_ORGANISM): Accession {
        return prepareExtractedSequencesInDatabase(1, organism = organism)[0].accession
    }

    private fun prepareExtractedSequencesInDatabase(
        numberOfSequenceEntries: Int = SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES,
        organism: String = DEFAULT_ORGANISM,
    ): List<UnprocessedData> {
        convenienceClient.submitDefaultFiles(organism = organism)
        return convenienceClient.extractUnprocessedData(numberOfSequenceEntries, organism = organism)
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
                name = "data with missing gene in alignedAminoAcidSequences",
                processedData = PreparedProcessedData.withMissingGeneInAminoAcidSequences(
                    gene = "someShortGene",
                ),
                expectedErrorMessage = "Missing the required gene 'someShortGene'.",
            ),
            InvalidDataScenario(
                name = "data with unknown gene in alignedAminoAcidSequences",
                processedData = PreparedProcessedData.withUnknownGeneInAminoAcidSequences(
                    gene = "someOtherGene",
                ),
                expectedErrorMessage = "Unknown genes in 'alignedAminoAcidSequences': someOtherGene.",
            ),
            InvalidDataScenario(
                name = "data with unknown gene in aminoAcidInsertions",
                processedData = PreparedProcessedData.withUnknownGeneInAminoAcidInsertions(
                    gene = "someOtherGene",
                ),
                expectedErrorMessage = "Unknown genes in 'aminoAcidInsertions': someOtherGene.",
            ),
            InvalidDataScenario(
                name = "data with gene in alignedAminoAcidSequences of wrong length",
                processedData = PreparedProcessedData.withAminoAcidSequenceOfWrongLength(gene = "someShortGene"),
                expectedErrorMessage = "The length of 'someShortGene' in 'alignedAminoAcidSequences' is 123, " +
                    "but it should be 4.",
            ),
            InvalidDataScenario(
                name = "data with gene in alignedAminoAcidSequences with wrong symbols",
                processedData = PreparedProcessedData.withAminoAcidSequenceWithWrongSymbols(gene = "someShortGene"),
                expectedErrorMessage = "The gene 'someShortGene' in 'alignedAminoAcidSequences' contains " +
                    "invalid symbols: [Ä, Ö].",
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
