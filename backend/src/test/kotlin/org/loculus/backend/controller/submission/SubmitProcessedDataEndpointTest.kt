package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.node.BooleanNode
import com.fasterxml.jackson.databind.node.DoubleNode
import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.TextNode
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.hasEntry
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.backend.api.Insertion
import org.loculus.backend.api.Status
import org.loculus.backend.api.SubmittedProcessedData
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.expectForbiddenResponse
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.service.submission.AminoAcidSymbols
import org.loculus.backend.service.submission.NucleotideSymbols
import org.loculus.backend.utils.Accession
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
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse(isModifyingRequest = true) {
            submissionControllerClient.submitProcessedData(
                PreparedProcessedData.successfullyProcessed("DoesNotMatter"),
                jwt = it,
            )
        }
    }

    @Test
    fun `GIVEN authorization token with wrong role THEN returns 403 Forbidden`() {
        expectForbiddenResponse {
            submissionControllerClient.submitProcessedData(
                PreparedProcessedData.successfullyProcessed("DoesNotMatter"),
                jwt = jwtForDefaultUser,
            )
        }
    }

    @Test
    fun `WHEN I submit successfully preprocessed data THEN the sequence entry is in status processed`() {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accessions.first()),
        )
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.AWAITING_APPROVAL)

        val sequenceEntryToEdit = convenienceClient.getSequenceEntryToEdit(accession = accessions.first(), version = 1)
        assertThat(sequenceEntryToEdit.processedData.metadata, hasEntry("qc", DoubleNode(0.987654321)))
        assertThat(sequenceEntryToEdit.processedData.metadata, hasEntry("age", IntNode(42)))
        assertThat(sequenceEntryToEdit.processedData.metadata, hasEntry("region", TextNode("Europe")))
        assertThat(sequenceEntryToEdit.processedData.metadata, hasEntry("pangoLineage", TextNode("XBB.1.5")))
        assertThat(sequenceEntryToEdit.processedData.metadata, hasEntry("booleanColumn", BooleanNode.TRUE))
    }

    @Test
    fun `WHEN I submit data with null as sequences THEN the sequence entry is in status processed`() {
        val (accession, version) = prepareExtractedSequencesInDatabase().first()

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withNullForSequences(accession = accession, version = version),
        )
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accession, version = version)
            .assertStatusIs(Status.AWAITING_APPROVAL)
    }

    @Test
    fun `WHEN I submit data with lowercase sequences THEN the sequences are converted to uppercase`() {
        val (accession, version) = prepareExtractedSequencesInDatabase().first()

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withLowercaseSequences(accession = accession, version = version),
        )
            .andExpect(status().isNoContent)

        val processedData = convenienceClient.getSequenceEntryToEdit(accession = accession, version = version)
            .processedData

        assertThat(processedData.unalignedNucleotideSequences, hasEntry(MAIN_SEGMENT, "NACTG"))
        assertThat(
            processedData.alignedNucleotideSequences,
            hasEntry(MAIN_SEGMENT, "ATTAAAGGTTTATACCTTCCCAGGTAACAAACCAACCAACTTTCGATCT"),
        )
        assertThat(processedData.alignedAminoAcidSequences, hasEntry(SOME_LONG_GENE, "ACDEFGHIKLMNPQRSTVWYBZX-*"))
        assertThat(processedData.nucleotideInsertions, hasEntry(MAIN_SEGMENT, listOf(Insertion(123, "ACTG"))))
        assertThat(processedData.aminoAcidInsertions, hasEntry(SOME_LONG_GENE, listOf(Insertion(123, "DEF"))))
    }

    @Test
    fun `WHEN I submit with all valid symbols THEN the sequence entry is in status processed`() {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        val allNucleotideSymbols = NucleotideSymbols.entries.joinToString("") { it.symbol.toString() }
        val desiredLength = 49

        val nucleotideSequenceOfDesiredLength = if (allNucleotideSymbols.length >= desiredLength) {
            throw Error("The desired length must be bigger than the length of all nucleotide symbols")
        } else {
            allNucleotideSymbols.repeat((desiredLength / allNucleotideSymbols.length) + 1).take(desiredLength)
        }

        val allAminoAcidSymbols = AminoAcidSymbols.entries.joinToString("") { it.symbol.toString() }
        val defaultData = PreparedProcessedData.successfullyProcessed(accessions.first()).data

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accessions.first()).copy(
                data = defaultData.copy(
                    unalignedNucleotideSequences = mapOf(MAIN_SEGMENT to nucleotideSequenceOfDesiredLength),
                    alignedNucleotideSequences = mapOf(MAIN_SEGMENT to nucleotideSequenceOfDesiredLength),
                    alignedAminoAcidSequences =
                    defaultData.alignedAminoAcidSequences + (SOME_LONG_GENE to allAminoAcidSymbols),
                ),
            ),
        )
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1).assertStatusIs(
            Status.AWAITING_APPROVAL,
        )
    }

    @Test
    fun `WHEN I submit preprocessed data without insertions THEN the missing keys of the reference will be added`() {
        val accessions = prepareExtractedSequencesInDatabase(organism = OTHER_ORGANISM).map { it.accession }

        val dataWithoutInsertions = PreparedProcessedData.successfullyProcessedOtherOrganismData(
            accessions.first(),
        ).data.copy(
            nucleotideInsertions = mapOf("notOnlySegment" to listOf(Insertion(1, "A"))),
            aminoAcidInsertions = emptyMap(),
        )

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessedOtherOrganismData(accession = accessions.first()).copy(
                data = dataWithoutInsertions,
            ),
            organism = OTHER_ORGANISM,
        ).andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(
            accession = accessions.first(),
            version = 1,
            organism = OTHER_ORGANISM,
        ).assertStatusIs(
            Status.AWAITING_APPROVAL,
        )

        submissionControllerClient.getSequenceEntryToEdit(
            accession = accessions.first(),
            version = 1,
            organism = OTHER_ORGANISM,
        )
            .andExpect(status().isOk)
            .andExpect(
                jsonPath("\$.processedData.nucleotideInsertions")
                    .value(
                        mapOf(
                            "notOnlySegment" to listOf(
                                Insertion(1, "A").toString(),
                            ),
                            "secondSegment" to emptyList(),
                        ),
                    ),
            )
            .andExpect(
                jsonPath("\$.processedData.aminoAcidInsertions")
                    .value(mapOf("someShortGene" to emptyList<String>(), "someLongGene" to emptyList())),
            )
    }

    @Test
    fun `WHEN I submit single-segment data without insertions THEN the missing keys of the reference will be added`() {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        val dataWithoutInsertions = PreparedProcessedData.successfullyProcessed(accessions.first()).data.copy(
            nucleotideInsertions = mapOf("main" to listOf(Insertion(1, "A"))),
            aminoAcidInsertions = emptyMap(),
        )

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accessions.first()).copy(
                data = dataWithoutInsertions,
            ),
        ).andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1).assertStatusIs(
            Status.AWAITING_APPROVAL,
        )

        submissionControllerClient.getSequenceEntryToEdit(
            accession = accessions.first(),
            version = 1,
        )
            .andExpect(status().isOk)
            .andExpect(
                jsonPath("\$.processedData.nucleotideInsertions.$MAIN_SEGMENT[0]")
                    .value(Insertion(1, "A").toString()),
            )
            .andExpect(
                jsonPath("\$.processedData.aminoAcidInsertions")
                    .value(mapOf(SOME_SHORT_GENE to emptyList<String>(), SOME_LONG_GENE to emptyList())),
            )
    }

    @Test
    fun `WHEN I submit null for a non-required field THEN the sequence entry is in status processed`() {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withNullForFields(accession = accessions.first(), fields = listOf("dateSubmitted")),
        )
            .andExpect(status().isNoContent)

        prepareExtractedSequencesInDatabase()

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.AWAITING_APPROVAL)
    }

    @Test
    fun `WHEN I submit data with errors THEN the sequence entry is in status has errors`() {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        submissionControllerClient.submitProcessedData(PreparedProcessedData.withErrors(accessions.first()))
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.HAS_ERRORS)
    }

    @Test
    fun `GIVEN I submitted invalid data and errors THEN the sequence entry is in status has errors`() {
        convenienceClient.submitDefaultFiles()
        val accession = convenienceClient.extractUnprocessedData(1).first().accession
        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withWrongDateFormat(accession).copy(
                accession = accession,
                errors = PreparedProcessedData.withErrors(accession).errors,
            ),
        ).andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)
    }

    @Test
    fun `WHEN I submit data with warnings THEN the sequence entry is in status processed`() {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        submissionControllerClient.submitProcessedData(PreparedProcessedData.withWarnings(accessions.first()))
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.AWAITING_APPROVAL)
    }

    @ParameterizedTest(name = "{arguments}")
    @MethodSource("provideInvalidDataScenarios")
    fun `GIVEN invalid processed data THEN refuses to update and an error will be thrown`(
        invalidDataScenario: InvalidDataScenario,
    ) {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        submissionControllerClient.submitProcessedData(
            invalidDataScenario.processedDataThatNeedsAValidAccession.copy(accession = accessions.first()),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.detail").value(invalidDataScenario.expectedErrorMessage))

        val sequenceStatus = convenienceClient.getSequenceEntry(
            accession = accessions.first(),
            version = 1,
        )
        assertThat(sequenceStatus.status, `is`(Status.IN_PROCESSING))
    }

    @Test
    fun `WHEN I submit data for a non-existent accession THEN refuses update with unprocessable entity`() {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        val nonExistentAccession = "999"

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accessions.first()),
            PreparedProcessedData.successfullyProcessed(accession = nonExistentAccession),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail")
                    .value(
                        "Accession version $nonExistentAccession.1 does not exist or is not awaiting " +
                            "any processing results",
                    ),
            )

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1).assertStatusIs(
            Status.IN_PROCESSING,
        )
    }

    @Test
    fun `WHEN I submit data for a non-existent accession version THEN refuses update with unprocessable entity`() {
        val accessions = prepareExtractedSequencesInDatabase().map { it.accession }

        val nonExistentVersion = 999L

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accessions.first()),
            PreparedProcessedData.successfullyProcessed(accession = accessions.first())
                .copy(version = nonExistentVersion),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession version ${accessions.first()}.$nonExistentVersion does not exist " +
                        "or is not awaiting any processing results",
                ),
            )

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.IN_PROCESSING)
    }

    @Test
    fun `WHEN I submit data for an entry that is not in processing THEN refuses update with unprocessable entity`() {
        val accessionsNotInProcessing = convenienceClient.prepareDataTo(Status.AWAITING_APPROVAL).map { it.accession }
        val accessionsInProcessing = convenienceClient.prepareDataTo(Status.IN_PROCESSING).map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessionsNotInProcessing.first(), version = 1)
            .assertStatusIs(Status.AWAITING_APPROVAL)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accessionsInProcessing.first()),
            PreparedProcessedData.successfullyProcessed(accession = accessionsNotInProcessing.first()),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession version ${accessionsNotInProcessing.first()}.1 " +
                        "does not exist or is not awaiting any processing results",
                ),
            )

        convenienceClient.getSequenceEntry(accession = accessionsInProcessing.first(), version = 1)
            .assertStatusIs(Status.IN_PROCESSING)
        convenienceClient.getSequenceEntry(accession = accessionsNotInProcessing.first(), version = 1)
            .assertStatusIs(Status.AWAITING_APPROVAL)
    }

    @Test
    fun `WHEN I submit a JSON entry with a missing field THEN returns bad request`() {
        val accession = prepareUnprocessedSequenceEntry()

        submissionControllerClient.submitProcessedDataRaw(
            """
                {
                    "accession": "$accession",
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
        val accession = prepareUnprocessedSequenceEntry(OTHER_ORGANISM)

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accession),
            organism = DEFAULT_ORGANISM,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail")
                    .value(containsString("$accession.1 is for organism otherOrganism")),
            )
            .andExpect(
                jsonPath("\$.detail")
                    .value(containsString("submitted data is for organism dummyOrganism")),
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
                jsonPath("\$.detail").value("Unknown fields in metadata: specialOtherField."),
            )

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessedOtherOrganismData(accession = otherOrganismAccession),
            organism = OTHER_ORGANISM,
        )
            .andExpect(status().isNoContent)
    }

    private fun prepareUnprocessedSequenceEntry(organism: String = DEFAULT_ORGANISM): Accession =
        prepareExtractedSequencesInDatabase(1, organism = organism)[0].accession

    private fun prepareExtractedSequencesInDatabase(
        numberOfSequenceEntries: Int = SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES,
        organism: String = DEFAULT_ORGANISM,
    ): List<UnprocessedData> {
        convenienceClient.submitDefaultFiles(organism = organism)
        return convenienceClient.extractUnprocessedData(numberOfSequenceEntries, organism = organism)
    }

    companion object {
        @JvmStatic
        fun provideInvalidDataScenarios() = provideInvalidMetadataScenarios() +
            provideInvalidNucleotideSequenceDataScenarios() +
            provideInvalidAminoAcidSequenceDataScenarios()

        @JvmStatic
        fun provideInvalidMetadataScenarios() = listOf(
            InvalidDataScenario(
                name = "data with unknown metadata fields",
                processedDataThatNeedsAValidAccession = PreparedProcessedData.withUnknownMetadataField(
                    accession = "DoesNotMatter",
                    fields = listOf(
                        "unknown field 1",
                        "unknown field 2",
                    ),
                ),
                expectedErrorMessage = "Unknown fields in metadata: unknown field 1, unknown field 2.",
            ),
            InvalidDataScenario(
                name = "data with missing required fields",
                processedDataThatNeedsAValidAccession = PreparedProcessedData.withMissingRequiredField(
                    accession = "DoesNotMatter",
                    fields = listOf("date", "region"),
                ),
                expectedErrorMessage = "Missing the required field 'date'.",
            ),
            InvalidDataScenario(
                name = "data with wrong type for fields",
                processedDataThatNeedsAValidAccession = PreparedProcessedData.withWrongTypeForFields(
                    accession = "DoesNotMatter",
                ),
                expectedErrorMessage = "Expected type 'string' for field 'region', found value '5'.",
            ),
            InvalidDataScenario(
                name = "data with wrong date format",
                processedDataThatNeedsAValidAccession = PreparedProcessedData.withWrongDateFormat(
                    accession = "DoesNotMatter",
                ),
                expectedErrorMessage =
                "Expected type 'date' in format 'yyyy-MM-dd' for field 'date', found value '\"1.2.2021\"'.",
            ),
            InvalidDataScenario(
                name = "data with wrong boolean format",
                processedDataThatNeedsAValidAccession = PreparedProcessedData.withWrongBooleanFormat(
                    accession = "DoesNotMatter",
                ),
                expectedErrorMessage =
                "Expected type 'boolean' for field 'booleanColumn', found value '\"not a boolean\"'.",
            ),
            InvalidDataScenario(
                name = "data with wrong pango lineage format",
                processedDataThatNeedsAValidAccession = PreparedProcessedData.withWrongPangoLineageFormat(
                    accession = "DoesNotMatter",
                ),
                expectedErrorMessage =
                "Expected type 'pango_lineage' for field 'pangoLineage', found value '\"A.5.invalid\"'. " +
                    "A pango lineage must be of the form [a-zA-Z]{1,3}(\\.\\d{1,3}){0,3}, e.g. 'XBB' or 'BA.1.5'.",
            ),
            InvalidDataScenario(
                name = "data with explicit null for required field",
                processedDataThatNeedsAValidAccession = PreparedProcessedData.withNullForFields(
                    accession = "DoesNotMatter",
                    fields = listOf("date"),
                ),
                expectedErrorMessage = "Field 'date' is null, but a value is required.",
            ),
        )

        @JvmStatic
        fun provideInvalidNucleotideSequenceDataScenarios() = listOf(
            InvalidDataScenario(
                name = "data with missing segment in unaligned nucleotide sequences",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withMissingSegmentInUnalignedNucleotideSequences(
                        accession = "DoesNotMatter",
                        segment = "main",
                    ),
                expectedErrorMessage = "Missing the required segment 'main' in 'unalignedNucleotideSequences'.",
            ),
            InvalidDataScenario(
                name = "data with missing segment in aligned nucleotide sequences",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withMissingSegmentInAlignedNucleotideSequences(
                        accession = "DoesNotMatter",
                        segment = "main",
                    ),
                expectedErrorMessage = "Missing the required segment 'main' in 'alignedNucleotideSequences'.",
            ),
            InvalidDataScenario(
                name = "data with unknown segment in alignedNucleotideSequences",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withUnknownSegmentInAlignedNucleotideSequences(
                        accession = "DoesNotMatter",
                        segment = "someOtherSegment",
                    ),
                expectedErrorMessage = "Unknown segments in 'alignedNucleotideSequences': someOtherSegment.",
            ),
            InvalidDataScenario(
                name = "data with unknown segment in unalignedNucleotideSequences",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withUnknownSegmentInUnalignedNucleotideSequences(
                        accession = "DoesNotMatter",
                        segment = "someOtherSegment",
                    ),
                expectedErrorMessage = "Unknown segments in 'unalignedNucleotideSequences': someOtherSegment.",
            ),
            InvalidDataScenario(
                name = "data with unknown segment in nucleotideInsertions",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withUnknownSegmentInNucleotideInsertions(
                        accession = "DoesNotMatter",
                        segment = "someOtherSegment",
                    ),
                expectedErrorMessage = "Unknown segments in 'nucleotideInsertions': someOtherSegment.",
            ),
            InvalidDataScenario(
                name = "data with segment in aligned nucleotide sequences of wrong length",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withAlignedNucleotideSequenceOfWrongLength(
                        accession = "DoesNotMatter",
                        segment = "main",
                    ),
                expectedErrorMessage = "The length of 'main' in 'alignedNucleotideSequences' is 123, " +
                    "but it should be 49.",
            ),
            InvalidDataScenario(
                name = "data with segment in aligned nucleotide sequences with wrong symbols",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withAlignedNucleotideSequenceWithWrongSymbols(
                        accession = "DoesNotMatter",
                        segment = "main",
                    ),
                expectedErrorMessage = "The sequence of segment 'main' in 'alignedNucleotideSequences' " +
                    "contains invalid symbols: [Ä, Ö].",
            ),
            InvalidDataScenario(
                name = "data with segment in unaligned nucleotide sequences with wrong symbols",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withUnalignedNucleotideSequenceWithWrongSymbols(
                        accession = "DoesNotMatter",
                        segment = "main",
                    ),
                expectedErrorMessage = "The sequence of segment 'main' in 'unalignedNucleotideSequences' contains " +
                    "invalid symbols: [Ä, Ö, -].",
            ),
            InvalidDataScenario(
                name = "data with segment in nucleotide insertions with wrong symbols",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withNucleotideInsertionsWithWrongSymbols(
                        accession = "DoesNotMatter",
                        segment = "main",
                    ),
                expectedErrorMessage = "The insertion 123:ÄÖ of segment 'main' in 'nucleotideInsertions' contains " +
                    "invalid symbols: [Ä, Ö].",
            ),
        )

        @JvmStatic
        fun provideInvalidAminoAcidSequenceDataScenarios() = listOf(
            InvalidDataScenario(
                name = "data with missing gene in alignedAminoAcidSequences",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withMissingGeneInAlignedAminoAcidSequences(
                        accession = "DoesNotMatter",
                        gene = SOME_SHORT_GENE,
                    ),
                expectedErrorMessage = "Missing the required gene 'someShortGene'.",
            ),
            InvalidDataScenario(
                name = "data with unknown gene in alignedAminoAcidSequences",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withUnknownGeneInAlignedAminoAcidSequences(
                        accession = "DoesNotMatter",
                        gene = "someOtherGene",
                    ),
                expectedErrorMessage = "Unknown genes in 'alignedAminoAcidSequences': someOtherGene.",
            ),
            InvalidDataScenario(
                name = "data with unknown gene in aminoAcidInsertions",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withUnknownGeneInAminoAcidInsertions(
                        accession = "DoesNotMatter",
                        gene = "someOtherGene",
                    ),
                expectedErrorMessage = "Unknown genes in 'aminoAcidInsertions': someOtherGene.",
            ),
            InvalidDataScenario(
                name = "data with gene in alignedAminoAcidSequences of wrong length",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withAminoAcidSequenceOfWrongLength(
                        accession = "DoesNotMatter",
                        gene = SOME_SHORT_GENE,
                    ),
                expectedErrorMessage = "The length of 'someShortGene' in 'alignedAminoAcidSequences' is 123, " +
                    "but it should be 4.",
            ),
            InvalidDataScenario(
                name = "data with gene in alignedAminoAcidSequences with wrong symbols",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withAminoAcidSequenceWithWrongSymbols(
                        accession = "DoesNotMatter",
                        gene = SOME_SHORT_GENE,
                    ),
                expectedErrorMessage = "The gene 'someShortGene' in 'alignedAminoAcidSequences' contains " +
                    "invalid symbols: [Ä, Ö].",
            ),
            InvalidDataScenario(
                name = "data with segment in amino acid insertions with wrong symbols",
                processedDataThatNeedsAValidAccession = PreparedProcessedData
                    .withAminoAcidInsertionsWithWrongSymbols(
                        accession = "DoesNotMatter",
                        gene = SOME_SHORT_GENE,
                    ),
                expectedErrorMessage = "An insertion of gene 'someShortGene' in 'aminoAcidInsertions' contains " +
                    "invalid symbols: [Ä, Ö].",
            ),
        )
    }
}

data class InvalidDataScenario(
    val name: String,
    val processedDataThatNeedsAValidAccession: SubmittedProcessedData,
    val expectedErrorMessage: String,
) {
    override fun toString(): String = "GIVEN $name THEN the response contains $expectedErrorMessage"
}
