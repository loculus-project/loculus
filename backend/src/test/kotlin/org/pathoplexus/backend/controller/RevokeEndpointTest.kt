package org.pathoplexus.backend.controller

import org.junit.jupiter.api.Test
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.api.Status.AWAITING_APPROVAL_FOR_REVOCATION
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
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
    fun `GIVEN sequences with 'APPROVED_FOR_RELEASE' THEN the status changes to 'AWAITING_APPROVAL_FOR_REVOCATION'`() {
        convenienceClient.prepareDefaultSequencesToApprovedForRelease()

        client.revokeSequences(DefaultFiles.allSequenceIds)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(DefaultFiles.NUMBER_OF_SEQUENCES))
            .andExpect(jsonPath("\$[0].sequenceId").value(DefaultFiles.firstSequence))
            .andExpect(jsonPath("\$[0].version").value(2))
            .andExpect(jsonPath("\$[0].status").value("AWAITING_APPROVAL_FOR_REVOCATION"))
            .andExpect(jsonPath("\$[0].isRevocation").value(true))

        convenienceClient.getSequenceVersionOfUser(sequenceId = DefaultFiles.firstSequence, version = 2)
            .assertStatusIs(AWAITING_APPROVAL_FOR_REVOCATION)
    }

    @Test
    fun `WHEN revoking non-existing sequenceIds THEN throws an unprocessableEntity error`() {
        convenienceClient.prepareDefaultSequencesToApprovedForRelease()

        val nonExistingSequenceId = "123"
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
        convenienceClient.prepareDefaultSequencesToApprovedForRelease()

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
    fun `WHEN revoking with latest version not 'APPROVED_FOR_RELEASE' THEN throws an unprocessableEntity error`() {
        convenienceClient.prepareDefaultSequencesToHasErrors()

        client.revokeSequences(DefaultFiles.allSequenceIds.subList(0, 2))
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Sequence versions are in not in one of the states [${Status.APPROVED_FOR_RELEASE}]: " +
                        "1.1 - ${Status.HAS_ERRORS}, 2.1 - ${Status.HAS_ERRORS}",
                ),
            )
    }
}
