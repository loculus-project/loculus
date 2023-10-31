package org.pathoplexus.backend.controller

import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.TextNode
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.api.ProcessedData
import org.pathoplexus.backend.api.SequenceVersion
import org.pathoplexus.backend.api.SiloVersionStatus
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles
import org.pathoplexus.backend.controller.SubmitFiles.DefaultFiles.firstSequence
import org.pathoplexus.backend.service.SequenceId
import org.pathoplexus.backend.service.Version
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class GetReleasedDataEndpointTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val submissionControllerClient: SubmissionControllerClient,
) {

    @Test
    fun `GIVEN no sequences in database THEN returns empty response`() {
        val response = submissionControllerClient.getReleasedData()

        val responseBody = response.expectNdjsonAndGetContent<ProcessedData>()
        assertThat(responseBody, `is`(emptyList()))
    }

    @Test
    fun `GIVEN released data exists THEN returns it with additional metadata fields`() {
        convenienceClient.prepareDefaultSequencesToSiloReady()

        val response = submissionControllerClient.getReleasedData()

        val responseBody = response.expectNdjsonAndGetContent<ProcessedData>()

        assertThat(responseBody.size, `is`(DefaultFiles.NUMBER_OF_SEQUENCES))

        responseBody.forEach {
            val id = it.metadata["sequenceId"]!!.asText()
            val version = it.metadata["version"]!!.asLong()
            assertThat(version, `is`(1L))

            val expectedData = defaultProcessedData.withValues(
                metadata = defaultProcessedData.metadata + mapOf(
                    "sequenceId" to TextNode(id),
                    "version" to IntNode(version.toInt()),
                    "sequenceVersion" to TextNode("$id.$version"),
                    "isRevocation" to TextNode("false"),
                    "submitter" to TextNode(USER_NAME),
                    "versionStatus" to TextNode("LATEST_VERSION"),
                ),
            )

            assertThat(it, `is`(expectedData))
        }
    }

    @Test
    fun `GIVEN released data exists in multiple versions THEN the 'versionStatus' flag is set correctly`() {
        val (
            revokedVersion1,
            revokedVersion2,
            _,
//            revocationVersion3,
            revisedVersion4,
            latestVersion5,
        ) = prepareRevokedAndRevocationAndRevisedVersions()

        val response = submissionControllerClient.getReleasedData().expectNdjsonAndGetContent<ProcessedData>()

        // TODO(#429): this should show 50 sequences when including revocation versions
//        assertThat(response.size, `is`(5 * DefaultFiles.NUMBER_OF_SEQUENCES))
        assertThat(response.size, `is`(4 * DefaultFiles.NUMBER_OF_SEQUENCES))
        assertThat(
            response.findSequenceVersionStatus(firstSequence, revokedVersion1),
            `is`(SiloVersionStatus.REVOKED.name),
        )
        assertThat(
            response.findSequenceVersionStatus(firstSequence, revokedVersion2),
            `is`(SiloVersionStatus.REVOKED.name),
        )
        // TODO(#429): reactivate this check
//        assertThat(
//            response.findSequenceVersionStatus(firstSequence, revocationVersion3),
//            `is`(SiloVersionStatus.REVISED.name),
//        )
        assertThat(
            response.findSequenceVersionStatus(firstSequence, revisedVersion4),
            `is`(SiloVersionStatus.REVISED.name),
        )
        assertThat(
            response.findSequenceVersionStatus(firstSequence, latestVersion5),
            `is`(SiloVersionStatus.LATEST_VERSION.name),
        )
    }

    private fun prepareRevokedAndRevocationAndRevisedVersions(): PreparedVersions {
        convenienceClient.prepareDefaultSequencesToSiloReady()
        convenienceClient.reviseAndProcessDefaultSequences()

        convenienceClient.revokeSequences(DefaultFiles.allSequenceIds)
        convenienceClient.confirmRevocation(
            DefaultFiles.allSequenceIds.map { SequenceVersion(sequenceId = it, version = 3L) },
        )

        convenienceClient.reviseAndProcessDefaultSequences()
        convenienceClient.reviseAndProcessDefaultSequences()

        return PreparedVersions(
            revokedVersion1 = 1L,
            revokedVersion2 = 2L,
            revocationVersion3 = 3L,
            revisedVersion4 = 4L,
            latestVersion5 = 5L,
        )
    }
}

private fun List<ProcessedData>.findSequenceVersionStatus(sequenceId: SequenceId, version: Version): String {
    val processedData =
        find { it.metadata["sequenceId"]?.asLong() == sequenceId && it.metadata["version"]?.asLong() == version }
            ?: error("Could not find sequence version $sequenceId.$version")

    return processedData.metadata["versionStatus"]!!.asText()
}

data class PreparedVersions(
    val revokedVersion1: Version,
    val revokedVersion2: Version,
    val revocationVersion3: Version,
    val revisedVersion4: Version,
    val latestVersion5: Version,
)
