package org.loculus.backend.controller.submission

import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.shaded.org.awaitility.Awaitility.await

@EndpointTest
class SubmittedDataRevisionWorkflowTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
) {

    @Test
    fun `GIVEN released sequences WHEN downloading and modifying submitted data THEN can submit revision`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(groupId = groupId)

        assertThat(accessionVersions, hasSize(greaterThan(0)))
        val firstAccession = accessionVersions[0].accession

        val response = submissionControllerClient.getSubmittedData(groupId = groupId)
            .andExpect(status().isOk)
            .andExpect(content().contentType("application/zip"))
            .andReturn()
            .response

        await().until { response.isCommitted }

        val zipContent = response.contentAsByteArray
        val (metadataTsv, sequencesFasta) = extractOriginalDataZipContents(zipContent)

        val metadataLines = metadataTsv.lines().filter { it.isNotBlank() }
        val headers = metadataLines[0].split("\t")

        assertThat(headers.contains("id"), `is`(true))
        assertThat(headers.contains("accession"), `is`(true))
        assertThat(headers.contains("date"), `is`(true))

        val idIndex = headers.indexOf("id")
        val accessionIndex = headers.indexOf("accession")
        val dateIndex = headers.indexOf("date")

        val firstDataRow = metadataLines[1].split("\t")
        assertThat(firstDataRow[idIndex], `is`(SubmitFiles.DefaultFiles.submissionIds[0]))
        assertThat(firstDataRow[accessionIndex], `is`(firstAccession))
        assertThat(sequencesFasta.contains(">${SubmitFiles.DefaultFiles.submissionIds[0]}"), `is`(true))

        val originalDate = firstDataRow[dateIndex]
        val newDate = "2099-01-01"
        assertThat(newDate, `is`(org.hamcrest.Matchers.not(originalDate)))

        val revisedMetadataContent = buildRevisedMetadata(metadataLines, headers, dateIndex, newDate)
        val revisedMetadataFile = MockMultipartFile(
            "metadataFile",
            "metadata.tsv",
            MediaType.TEXT_PLAIN_VALUE,
            revisedMetadataContent.toByteArray(),
        )

        val revisedSequencesFile = MockMultipartFile(
            "sequenceFile",
            "sequences.fasta",
            MediaType.TEXT_PLAIN_VALUE,
            sequencesFasta.toByteArray(),
        )

        submissionControllerClient.reviseSequenceEntries(
            metadataFile = revisedMetadataFile,
            sequencesFile = revisedSequencesFile,
            jwt = jwtForDefaultUser,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(accessionVersions.size))
            .andExpect(jsonPath("\$[0].accession").value(firstAccession))
            .andExpect(jsonPath("\$[0].version").value(2))

        val revisedEntry = convenienceClient.getSequenceEntry(accession = firstAccession, version = 2)
        assertThat(revisedEntry.accession, `is`(firstAccession))
        assertThat(revisedEntry.version, `is`(2L))
    }

    @Test
    fun `GIVEN filtered download WHEN modifying and submitting revision THEN only selected sequences are revised`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(groupId = groupId)

        assertThat(accessionVersions, hasSize(greaterThan(1)))

        val selectedAccession = accessionVersions[0].accession

        val response = submissionControllerClient.getSubmittedData(
            groupId = groupId,
            accessionsFilter = listOf(selectedAccession),
        )
            .andExpect(status().isOk)
            .andReturn()
            .response

        await().until { response.isCommitted }

        val zipContent = response.contentAsByteArray
        val (metadataTsv, sequencesFasta) = extractOriginalDataZipContents(zipContent)

        val metadataLines = metadataTsv.lines().filter { it.isNotBlank() }
        assertThat(metadataLines.size, `is`(2))

        val headers = metadataLines[0].split("\t")
        val dateIndex = headers.indexOf("date")

        val revisedMetadataContent = buildRevisedMetadata(metadataLines, headers, dateIndex, "2099-12-31")
        val revisedMetadataFile = MockMultipartFile(
            "metadataFile",
            "metadata.tsv",
            MediaType.TEXT_PLAIN_VALUE,
            revisedMetadataContent.toByteArray(),
        )

        val revisedSequencesFile = MockMultipartFile(
            "sequenceFile",
            "sequences.fasta",
            MediaType.TEXT_PLAIN_VALUE,
            sequencesFasta.toByteArray(),
        )

        submissionControllerClient.reviseSequenceEntries(
            metadataFile = revisedMetadataFile,
            sequencesFile = revisedSequencesFile,
            jwt = jwtForDefaultUser,
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.length()").value(1))
            .andExpect(jsonPath("\$[0].accession").value(selectedAccession))
            .andExpect(jsonPath("\$[0].version").value(2))

        val revisedEntry = convenienceClient.getSequenceEntry(accession = selectedAccession, version = 2)
        assertThat(revisedEntry.version, `is`(2L))

        val otherAccession = accessionVersions[1].accession
        val otherEntry = convenienceClient.getSequenceEntry(accession = otherAccession, version = 1)
        assertThat(otherEntry.version, `is`(1L))
    }

    private fun buildRevisedMetadata(
        metadataLines: List<String>,
        headers: List<String>,
        dateIndex: Int,
        newDate: String,
    ): String {
        val idIndex = headers.indexOf("id")

        val newHeaders = headers.toMutableList()
        newHeaders[idIndex] = "submissionId"

        val resultLines = mutableListOf<String>()
        resultLines.add(newHeaders.joinToString("\t"))

        for (i in 1 until metadataLines.size) {
            val row = metadataLines[i].split("\t").toMutableList()
            while (row.size < headers.size) {
                row.add("")
            }
            if (dateIndex >= 0 && dateIndex < row.size) {
                row[dateIndex] = newDate
            }
            resultLines.add(row.joinToString("\t"))
        }

        return resultLines.joinToString("\n")
    }
}
