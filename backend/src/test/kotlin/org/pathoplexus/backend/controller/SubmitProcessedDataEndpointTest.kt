package org.pathoplexus.backend.controller

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles.firstSequence
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
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$[0].sequenceId").value(3))
            .andExpect(jsonPath("\$[0].validation.type").value("Ok"))
            .andExpect(jsonPath("\$[1].sequenceId").value(4))
            .andExpect(jsonPath("\$[1].validation.type").value("Ok"))

        convenienceClient.getSequenceVersionOfUser(sequenceId = 3, version = 1).assertStatusIs(Status.PROCESSED)
    }

    @Test
    fun `WHEN I submit null for a non-required field THEN the sequence is in status processed`() {
        prepareExtractedSequencesInDatabase()

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.withNullForFields(fields = listOf("dateSubmitted")),
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$[0].sequenceId").value(firstSequence))
            .andExpect(jsonPath("\$[0].validation.type").value("Ok"))
            .andReturn()

        prepareExtractedSequencesInDatabase()

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.PROCESSED)
    }

    @Test
    fun `WHEN I submit data with errors THEN the sequence is in status needs review`() {
        prepareExtractedSequencesInDatabase()

        submissionControllerClient.submitProcessedData(PreparedProcessedData.withErrors(firstSequence))
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$[0].sequenceId").value(firstSequence))
            .andExpect(jsonPath("\$[0].validation.type").value("Ok"))

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.NEEDS_REVIEW)
    }

    @Test
    fun `WHEN I submit data with warnings THEN the sequence is in status processed`() {
        prepareExtractedSequencesInDatabase()

        submissionControllerClient.submitProcessedData(PreparedProcessedData.withWarnings(firstSequence))
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$[0].sequenceId").value(firstSequence))
            .andExpect(jsonPath("\$[0].validation.type").value("Ok"))

        convenienceClient.getSequenceVersionOfUser(sequenceId = firstSequence, version = 1)
            .assertStatusIs(Status.PROCESSED)
    }

    @ParameterizedTest(name = "{arguments}")
    @MethodSource("provideInvalidDataScenarios")
    fun `GIVEN invalid processed data THEN the response contains validation errors`(
        invalidDataScenario: InvalidDataScenario,
    ) {
        prepareExtractedSequencesInDatabase()

        val response = submissionControllerClient.submitProcessedData(invalidDataScenario.processedData)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$[0].sequenceId").value(invalidDataScenario.processedData.sequenceId))
            .andExpect(jsonPath("\$[0].validation.type").value("Error"))

        for ((index, expectedError) in invalidDataScenario.expectedValidationErrors.withIndex()) {
            val (expectedType, fieldName, expectedMessage) = expectedError
            response
                .andExpect(jsonPath("\$[0].validation.validationErrors[$index].type").value(expectedType))
                .andExpect(jsonPath("\$[0].validation.validationErrors[$index].fieldName").value(fieldName))
                .andExpect(
                    jsonPath("\$[0].validation.validationErrors[$index].message")
                        .value(containsString(expectedMessage)),
                )
        }

        val sequenceStatus = convenienceClient.getSequenceVersionOfUser(
            sequenceId = invalidDataScenario.processedData.sequenceId,
            version = 1,
        )
        assertThat(sequenceStatus.status, `is`(Status.NEEDS_REVIEW))
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
        fun provideInvalidDataScenarios() = listOf(
            InvalidDataScenario(
                name = "data with unknown metadata fields",
                processedData = PreparedProcessedData.withUnknownMetadataField(
                    fields = listOf(
                        "unknown field 1",
                        "unknown field 2",
                    ),
                ),
                expectedValidationErrors = listOf(
                    Triple(
                        "UnknownField",
                        "unknown field 1",
                        "Found unknown field 'unknown field 1' in processed data",
                    ),
                    Triple(
                        "UnknownField",
                        "unknown field 2",
                        "Found unknown field 'unknown field 2' in processed data",
                    ),
                ),
            ),
            InvalidDataScenario(
                name = "data with missing required fields",
                processedData = PreparedProcessedData.withMissingRequiredField(fields = listOf("date", "region")),
                expectedValidationErrors = listOf(
                    Triple(
                        "MissingRequiredField",
                        "date",
                        "Missing the required field 'date'",
                    ),
                    Triple(
                        "MissingRequiredField",
                        "region",
                        "Missing the required field 'region'",
                    ),
                ),
            ),
            InvalidDataScenario(
                name = "data with wrong type for fields",
                processedData = PreparedProcessedData.withWrongTypeForFields(),
                expectedValidationErrors = listOf(
                    Triple(
                        "TypeMismatch",
                        "region",
                        "Expected type 'string' for field 'region', found value '5'",
                    ),
                    Triple(
                        "TypeMismatch",
                        "age",
                        "Expected type 'integer' for field 'age', found value '\"not a number\"'",
                    ),
                ),
            ),
            InvalidDataScenario(
                name = "data with wrong date format",
                processedData = PreparedProcessedData.withWrongDateFormat(),
                expectedValidationErrors = listOf(
                    Triple(
                        "TypeMismatch",
                        "date",
                        "Expected type 'date' in format 'yyyy-MM-dd' for field 'date', found value '\"1.2.2021\"'",
                    ),
                ),
            ),
            InvalidDataScenario(
                name = "data with wrong pango lineage format",
                processedData = PreparedProcessedData.withWrongPangoLineageFormat(),
                expectedValidationErrors = listOf(
                    Triple(
                        "TypeMismatch",
                        "pangoLineage",
                        "Expected type 'pango_lineage' for field 'pangoLineage', found value '\"A.5.invalid\"'.",
                    ),
                ),
            ),
            InvalidDataScenario(
                name = "data with explicit null for required field",
                processedData = PreparedProcessedData.withNullForFields(fields = listOf("date")),
                expectedValidationErrors = listOf(
                    Triple(
                        "MissingRequiredField",
                        "date",
                        "Field 'date' is null, but a value is required.",
                    ),
                ),
            ),
        )
    }
}

data class InvalidDataScenario(
    val name: String,
    val processedData: SubmittedProcessedData,
    val expectedValidationErrors: List<Triple<String, String, String>>,
) {
    override fun toString(): String {
        val errorsDisplay = expectedValidationErrors.joinToString(" and ") { it.first }
        val prefix = if (expectedValidationErrors.size > 1) {
            "the validation errors"
        } else {
            "the validation error"
        }

        return "GIVEN $name THEN the response contains $prefix $errorsDisplay"
    }
}
