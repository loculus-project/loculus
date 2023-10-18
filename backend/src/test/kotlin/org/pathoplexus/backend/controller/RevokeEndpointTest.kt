package org.pathoplexus.backend.controller

import org.junit.jupiter.api.Test
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.pathoplexus.backend.service.Status.REVOKED_STAGING
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class RevokeEndpointTest(
    @Autowired val client: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {
    @Test
    fun `GIVEN sequences with status 'SILO_READY' THEN the status changes to 'REVOKED_STAGING'`() {
        convenienceClient.prepareDefaultSequencesToSiloReady()

        client.revokeSequences(DefaultFiles.allSequenceIds)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(DefaultFiles.NUMBER_OF_SEQUENCES))
            .andExpect(jsonPath("\$[0].sequenceId").value(DefaultFiles.firstSequence))
            .andExpect(jsonPath("\$[0].version").value(2))
            .andExpect(jsonPath("\$[0].status").value("REVOKED_STAGING"))
            .andExpect(jsonPath("\$[0].isRevocation").value(true))

        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 2)
            .assertStatusIs(REVOKED_STAGING)
    }

    @Test
    fun `WHEN revoking non-existing sequenceIds THEN throws an unprocessableEntity error`() {
        convenienceClient.prepareDefaultSequencesToSiloReady()

        val nonExistingSequenceId = 123
        client.revokeSequences(listOf(nonExistingSequenceId))
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "SequenceIds $nonExistingSequenceId do not exist",
                ),
            )
    }

    @Test
    fun `WHEN revoking sequences not from the submitter THEN throws forbidden error`() {
        convenienceClient.prepareDefaultSequencesToSiloReady()

        val notSubmitter = "nonExistingUser"
        client.revokeSequences(DefaultFiles.allSequenceIds.subList(0, 2), notSubmitter)
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "User '$notSubmitter' does not have right to change the sequence versions " +
                        "1.1, 2.1",
                ),
            )
    }

    @Test
    fun `WHEN revoking sequences with latest version not 'SILO_READY' THEN throws an unprocessableEntity error`() {
        convenienceClient.prepareDefaultSequencesToNeedReview()

        client.revokeSequences(DefaultFiles.allSequenceIds.subList(0, 2))
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Sequence versions are in not in state SILO_READY: " +
                        "1.1 - NEEDS_REVIEW, 2.1 - NEEDS_REVIEW",
                ),
            )
    }
}
