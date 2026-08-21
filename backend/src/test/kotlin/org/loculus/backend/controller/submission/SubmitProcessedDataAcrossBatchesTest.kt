package org.loculus.backend.controller.submission

import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Status
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.assertStatusIs
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

/**
 * Results are stored one statement per batch of [BackendSpringProperty.STREAM_BATCH_SIZE] entries,
 * so anything that has to hold for a whole request needs a request that spans several batches.
 */
@EndpointTest(
    properties = ["${BackendSpringProperty.STREAM_BATCH_SIZE}=1"],
)
class SubmitProcessedDataAcrossBatchesTest(
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {

    @Test
    fun `WHEN a duplicate accession version spans two batches THEN returns bad request`() {
        val accessions = prepareExtractedSequences().map { it.accession }

        submissionControllerClient.submitProcessedData(
            PreparedProcessedData.successfullyProcessed(accession = accessions.first()),
            PreparedProcessedData.successfullyProcessed(accession = accessions[1]),
            PreparedProcessedData.successfullyProcessed(accession = accessions.first()),
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("\$.detail").value(containsString("duplicate accession version")))

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(Status.IN_PROCESSING)
        convenienceClient.getSequenceEntry(accession = accessions[1], version = 1)
            .assertStatusIs(Status.IN_PROCESSING)
    }

    @Test
    fun `WHEN I submit several entries spanning batches THEN all of them are stored`() {
        val accessions = prepareExtractedSequences().map { it.accession }.take(3)

        submissionControllerClient.submitProcessedData(
            *accessions
                .map { PreparedProcessedData.successfullyProcessed(accession = it) }
                .toTypedArray(),
        )
            .andExpect(status().isNoContent)

        accessions.forEach {
            convenienceClient.getSequenceEntry(accession = it, version = 1).assertStatusIs(Status.PROCESSED)
        }
    }

    private fun prepareExtractedSequences() = convenienceClient
        .also { it.submitDefaultFiles(organism = DEFAULT_ORGANISM) }
        .extractUnprocessedData(SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES, organism = DEFAULT_ORGANISM)
}
