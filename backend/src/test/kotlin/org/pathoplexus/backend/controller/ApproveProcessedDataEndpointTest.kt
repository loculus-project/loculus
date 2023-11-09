package org.pathoplexus.backend.controller

import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.api.SequenceVersion
import org.pathoplexus.backend.api.Status
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class ApproveProcessedDataEndpointTest(
    @Autowired val client: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {

    @Test
    fun `GIVEN sequences are processed WHEN I approve them THEN their status should be APPROVED_FOR_RELEASE`() {
        convenienceClient.prepareDatabaseWith(
            PreparedProcessedData.successfullyProcessed(sequenceId = "1"),
            PreparedProcessedData.successfullyProcessed(sequenceId = "2"),
        )

        client.approveProcessedSequences(
            listOf(
                SequenceVersion("1", 1),
                SequenceVersion("2", 1),
            ),
        )
            .andExpect(status().isNoContent)

        convenienceClient.getSequenceVersionOfUser(sequenceId = "1", version = 1).assertStatusIs(
            Status.APPROVED_FOR_RELEASE,
        )
        convenienceClient.getSequenceVersionOfUser(sequenceId = "2", version = 1).assertStatusIs(
            Status.APPROVED_FOR_RELEASE,
        )
    }

    @Test
    fun `WHEN I approve sequences of other user THEN it should fail as forbidden`() {
        convenienceClient.prepareDatabaseWith(
            PreparedProcessedData.successfullyProcessed(sequenceId = "1"),
            PreparedProcessedData.successfullyProcessed(sequenceId = "2"),
        )

        client.approveProcessedSequences(
            listOf(
                SequenceVersion("1", 1),
                SequenceVersion("2", 1),
            ),
            "other user",
        )
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(
                jsonPath(
                    "$.detail",
                    containsString("does not have right to change the sequence versions 1.1, 2.1"),
                ),
            )
    }

    @Test
    fun `WHEN I approve a sequence id that does not exist THEN no sequence should be approved`() {
        val nonExistentSequenceId = "999"

        convenienceClient.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed(sequenceId = "1"))

        val existingSequenceVersion = SequenceVersion("1", 1)

        client.approveProcessedSequences(
            listOf(
                existingSequenceVersion,
                SequenceVersion(nonExistentSequenceId, 1),
            ),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.detail", containsString("Sequence versions 999.1 do not exist")))

        convenienceClient.getSequenceVersionOfUser(existingSequenceVersion).assertStatusIs(Status.AWAITING_APPROVAL)
    }

    @Test
    fun `WHEN I approve a sequence version that does not exist THEN no sequence should be approved`() {
        val nonExistentVersion = 999L

        convenienceClient.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed(sequenceId = "1"))

        val existingSequenceVersion = SequenceVersion("1", 1)

        client.approveProcessedSequences(
            listOf(
                existingSequenceVersion,
                SequenceVersion("1", nonExistentVersion),
            ),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(jsonPath("$.detail", containsString("Sequence versions 1.999 do not exist")))

        convenienceClient.getSequenceVersionOfUser(existingSequenceVersion).assertStatusIs(Status.AWAITING_APPROVAL)
    }

    @Test
    fun `GIVEN one of the sequences is not processed WHEN I approve them THEN no sequence should be approved`() {
        convenienceClient.prepareDatabaseWith(PreparedProcessedData.successfullyProcessed(sequenceId = "1"))

        val sequenceVersionInCorrectState = SequenceVersion("1", 1)

        convenienceClient.getSequenceVersionOfUser(sequenceVersionInCorrectState).assertStatusIs(
            Status.AWAITING_APPROVAL,
        )
        convenienceClient.getSequenceVersionOfUser(sequenceId = "2", version = 1).assertStatusIs(Status.IN_PROCESSING)

        client.approveProcessedSequences(
            listOf(
                sequenceVersionInCorrectState,
                SequenceVersion("2", 1),
                SequenceVersion("3", 1),
            ),
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON))
            .andExpect(
                jsonPath("$.detail")
                    .value(
                        "Sequence versions are in not in one of the states [${Status.AWAITING_APPROVAL}]: " +
                            "2.1 - ${Status.IN_PROCESSING}, 3.1 - ${Status.IN_PROCESSING}",
                    ),
            )

        convenienceClient.getSequenceVersionOfUser(sequenceVersionInCorrectState).assertStatusIs(
            Status.AWAITING_APPROVAL,
        )
        convenienceClient.getSequenceVersionOfUser(sequenceId = "2", version = 1).assertStatusIs(Status.IN_PROCESSING)
        convenienceClient.getSequenceVersionOfUser(sequenceId = "3", version = 1).assertStatusIs(Status.IN_PROCESSING)
    }
}
