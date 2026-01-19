package org.loculus.backend.controller.submission

import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.matchesPattern
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DUMMY_ORGANISM_MAIN_SEQUENCE
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.ORGANISM_WITHOUT_CONSENSUS_SEQUENCES
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.loculus.backend.service.submission.SequenceEntriesTable
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpHeaders
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.shaded.org.awaitility.Awaitility.await
import java.io.ByteArrayInputStream
import java.util.zip.ZipInputStream

@EndpointTest
class GetOriginalDataEndpointTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
) {
    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        expectUnauthorizedResponse(isModifyingRequest = true) {
            submissionControllerClient.getOriginalData(groupId = groupId, jwt = it)
        }
    }

    @Test
    fun `GIVEN user not in group THEN returns 403 Forbidden`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        val otherUserJwt = generateJwtFor("otherUser")
        groupManagementClient.createNewGroup(jwt = otherUserJwt)

        submissionControllerClient.getOriginalData(groupId = groupId, jwt = otherUserJwt)
            .andExpect(status().isForbidden)
    }

    @Test
    fun `GIVEN no sequence entries in database THEN returns zip with header-only metadata and empty sequences`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()

        val response = submissionControllerClient.getOriginalData(groupId = groupId)
            .andExpect(status().isOk)
            .andExpect(content().contentType("application/zip"))
            .andReturn()
            .response

        await().until { response.isCommitted }

        val zipContent = response.contentAsByteArray
        val fileNames = getZipFileNames(zipContent)
        assertThat(fileNames, containsInAnyOrder("metadata.tsv", "sequences.fasta"))

        val (metadataTsv, sequencesFasta) = extractZipContents(zipContent)

        assertThat(metadataTsv, containsString("id\taccession"))
        val metadataLines = metadataTsv.lines().filter { it.isNotBlank() }
        assertThat("metadata should only contain header row", metadataLines, hasSize(1))
        assertThat(sequencesFasta, `is`(""))
    }

    @Test
    fun `GIVEN data exists THEN returns zip with metadata TSV and sequences FASTA`() {
        val submissionResult = convenienceClient.submitDefaultFiles()
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(groupId = submissionResult.groupId)

        val response = submissionControllerClient.getOriginalData(groupId = submissionResult.groupId)
            .andExpect(status().isOk)
            .andExpect(content().contentType("application/zip"))
            .andExpect(
                header().string(
                    HttpHeaders.CONTENT_DISPOSITION,
                    matchesPattern(
                        "attachment; filename=\"$DEFAULT_ORGANISM" +
                            "_original_data_[0-9]{8}T[0-9]{6}Z\\.zip\"",
                    ),
                ),
            )
            .andReturn()
            .response

        await().until { response.isCommitted }

        val zipContent = response.contentAsByteArray
        val (metadataTsv, sequencesFasta) = extractZipContents(zipContent)

        assertThat(metadataTsv, containsString("id\taccession"))
        val metadataLines = metadataTsv.lines().filter { it.isNotBlank() }
        assertThat(metadataLines, hasSize(DefaultFiles.NUMBER_OF_SEQUENCES + 1))
        assertThat(sequencesFasta, containsString(">"))
    }

    @Test
    fun `GIVEN unprocessed data was corrected after submission THEN returns corrected data`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(groupId = groupId)
        val correctedAccession = accessionVersions.first()

        transaction {
            val unprocessedData = SequenceEntriesTable
                .select(SequenceEntriesTable.unprocessedDataColumn)
                .where {
                    (SequenceEntriesTable.accessionColumn eq correctedAccession.accession) and
                        (SequenceEntriesTable.versionColumn eq correctedAccession.version)
                }
                .single()[SequenceEntriesTable.unprocessedDataColumn]!!

            SequenceEntriesTable.update(
                where = {
                    (SequenceEntriesTable.accessionColumn eq correctedAccession.accession) and
                        (SequenceEntriesTable.versionColumn eq correctedAccession.version)
                },
            ) {
                it[unprocessedDataColumn] = unprocessedData.copy(
                    metadata = unprocessedData.metadata + ("authors" to "Corrected Author"),
                )
            }
        }

        val response = submissionControllerClient.getOriginalData(groupId = groupId)
            .andExpect(status().isOk)
            .andReturn()
            .response

        await().until { response.isCommitted }

        val zipContent = response.contentAsByteArray
        val (metadataTsv, _) = extractZipContents(zipContent)

        assertThat(metadataTsv, containsString("authors"))
        assertThat(metadataTsv, containsString("Corrected Author"))
    }

    @Test
    fun `GIVEN data exists THEN metadata TSV contains id and accession columns`() {
        val submissionResult = convenienceClient.submitDefaultFiles()
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(
            groupId = submissionResult.groupId,
        )

        val response = submissionControllerClient.getOriginalData(groupId = submissionResult.groupId)
            .andExpect(status().isOk)
            .andReturn()
            .response

        await().until { response.isCommitted }

        val zipContent = response.contentAsByteArray
        val (metadataTsv, _) = extractZipContents(zipContent)

        val lines = metadataTsv.lines().filter { it.isNotBlank() }
        val header = lines[0].split("\t")

        assertThat(header[0], `is`("id"))
        assertThat(header[1], `is`("accession"))

        val firstDataRow = lines[1].split("\t")
        assertThat(firstDataRow[0], `is`(SubmitFiles.DefaultFiles.submissionIds[0]))
        assertThat(firstDataRow[1], `is`(accessionVersions[0].accession))
    }

    @Test
    fun `GIVEN data exists THEN FASTA headers match metadata ids`() {
        val submissionResult = convenienceClient.submitDefaultFiles()
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(
            groupId = submissionResult.groupId,
        )

        val response = submissionControllerClient.getOriginalData(groupId = submissionResult.groupId)
            .andExpect(status().isOk)
            .andReturn()
            .response

        await().until { response.isCommitted }

        val zipContent = response.contentAsByteArray
        val (metadataTsv, sequencesFasta) = extractZipContents(zipContent)

        val metadataIds = metadataTsv.lines()
            .filter { it.isNotBlank() }
            .drop(1)
            .map { it.split("\t")[0] }
            .toSet()

        val fastaIds = sequencesFasta.lines()
            .filter { it.startsWith(">") }
            .map { it.removePrefix(">") }
            .toSet()

        assertThat(fastaIds, `is`(metadataIds))

        val expectedIds = SubmitFiles.DefaultFiles.submissionIds.toSet()
        assertThat(metadataIds, `is`(expectedIds))
    }

    @Test
    fun `GIVEN duplicate original ids THEN downloaded ids are made unique without new clashes`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        submitAndApproveSingleSegmentSequences(
            listOf("sample", "sample", "sample_1", "sample"),
            groupId,
        )

        val response = submissionControllerClient.getOriginalData(groupId = groupId)
            .andExpect(status().isOk)
            .andReturn()
            .response

        await().until { response.isCommitted }

        val zipContent = response.contentAsByteArray
        val (metadataTsv, sequencesFasta) = extractZipContents(zipContent)

        val metadataIds = metadataTsv.lines()
            .filter { it.isNotBlank() }
            .drop(1)
            .map { it.split("\t")[0] }

        val fastaIds = sequencesFasta.lines()
            .filter { it.startsWith(">") }
            .map { it.removePrefix(">") }

        assertThat(metadataIds, containsInAnyOrder("sample", "sample_1", "sample_2", "sample_3"))
        assertThat(metadataIds.toSet(), hasSize(metadataIds.size))
        assertThat(fastaIds.toSet(), `is`(metadataIds.toSet()))
    }

    @Test
    fun `WHEN filtering by accessions THEN returns only those accessions`() {
        val submissionResult = convenienceClient.submitDefaultFiles()
        val accessionVersions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(
            groupId = submissionResult.groupId,
        )

        val selectedAccessions = accessionVersions.take(2).map { it.accession }

        val response = submissionControllerClient.getOriginalData(
            groupId = submissionResult.groupId,
            accessionsFilter = selectedAccessions,
        )
            .andExpect(status().isOk)
            .andReturn()
            .response

        await().until { response.isCommitted }

        val zipContent = response.contentAsByteArray
        val (metadataTsv, _) = extractZipContents(zipContent)

        val metadataLines = metadataTsv.lines().filter { it.isNotBlank() }
        assertThat(metadataLines, hasSize(3))

        val returnedAccessions = metadataLines.drop(1).map { it.split("\t")[1] }
        assertThat(returnedAccessions, containsInAnyOrder(*selectedAccessions.toTypedArray()))
    }

    @Test
    fun `WHEN filtering by non-existent accessions THEN returns empty data`() {
        val submissionResult = convenienceClient.submitDefaultFiles()
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(groupId = submissionResult.groupId)

        val response = submissionControllerClient.getOriginalData(
            groupId = submissionResult.groupId,
            accessionsFilter = listOf("NON_EXISTENT", "ALSO_NOT_THERE"),
        )
            .andExpect(status().isOk)
            .andReturn()
            .response

        await().until { response.isCommitted }

        val zipContent = response.contentAsByteArray
        val (metadataTsv, sequencesFasta) = extractZipContents(zipContent)

        val metadataLines = metadataTsv.lines().filter { it.isNotBlank() }
        assertThat(metadataLines, hasSize(1))
        assertThat(sequencesFasta, `is`(""))
    }

    @Test
    fun `GIVEN organism without consensus sequences THEN zip contains only metadata TSV`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(
            organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES,
            groupId = groupId,
        )

        val response = submissionControllerClient.getOriginalData(
            organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES,
            groupId = groupId,
        )
            .andExpect(status().isOk)
            .andReturn()
            .response

        await().until { response.isCommitted }

        val zipContent = response.contentAsByteArray
        val fileNames = getZipFileNames(zipContent)

        assertThat(fileNames, containsInAnyOrder("metadata.tsv"))
    }

    @Test
    fun `GIVEN only non-released sequences THEN returns empty data`() {
        val submissionResult = convenienceClient.submitDefaultFiles()

        val response = submissionControllerClient.getOriginalData(groupId = submissionResult.groupId)
            .andExpect(status().isOk)
            .andReturn()
            .response

        await().until { response.isCommitted }

        val zipContent = response.contentAsByteArray
        val (metadataTsv, _) = extractZipContents(zipContent)

        val metadataLines = metadataTsv.lines().filter { it.isNotBlank() }
        assertThat(metadataLines, hasSize(1))
    }

    @Test
    fun `GIVEN multi-segmented organism THEN metadata TSV has fastaIds column`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(
            organism = OTHER_ORGANISM,
            groupId = groupId,
        )

        val response = submissionControllerClient.getOriginalData(
            organism = OTHER_ORGANISM,
            groupId = groupId,
        )
            .andExpect(status().isOk)
            .andReturn()
            .response

        await().until { response.isCommitted }

        val zipContent = response.contentAsByteArray
        val (metadataTsv, _) = extractZipContents(zipContent)

        val lines = metadataTsv.lines().filter { it.isNotBlank() }
        val header = lines[0].split("\t")

        assertThat(header[0], `is`("id"))
        assertThat(header[1], `is`("accession"))
        assertThat(header[2], `is`("fastaIds"))
    }

    @Test
    fun `GIVEN multi-segmented organism THEN fastaIds contain original fasta ids`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(
            organism = OTHER_ORGANISM,
            groupId = groupId,
        )

        val response = submissionControllerClient.getOriginalData(
            organism = OTHER_ORGANISM,
            groupId = groupId,
        )
            .andExpect(status().isOk)
            .andReturn()
            .response

        await().until { response.isCommitted }

        val zipContent = response.contentAsByteArray
        val (metadataTsv, _) = extractZipContents(zipContent)

        val lines = metadataTsv.lines().filter { it.isNotBlank() }
        val header = lines[0].split("\t")
        val fastaIdsIndex = header.indexOf("fastaIds")

        val firstDataRow = lines[1].split("\t")
        val fastaIds = firstDataRow[fastaIdsIndex]

        assertThat(fastaIds, containsString("${SubmitFiles.DefaultFiles.submissionIds[0]}_"))
    }

    @Test
    fun `GIVEN multi-segmented organism THEN FASTA headers contain original fasta ids`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(
            organism = OTHER_ORGANISM,
            groupId = groupId,
        )

        val response = submissionControllerClient.getOriginalData(
            organism = OTHER_ORGANISM,
            groupId = groupId,
        )
            .andExpect(status().isOk)
            .andReturn()
            .response

        await().until { response.isCommitted }

        val zipContent = response.contentAsByteArray
        val (_, sequencesFasta) = extractZipContents(zipContent)

        val fastaHeaders = sequencesFasta.lines().filter { it.startsWith(">") }
        val matchingHeaders = fastaHeaders.filter { it.contains("${SubmitFiles.DefaultFiles.submissionIds[0]}_") }
        assertThat(matchingHeaders.size, org.hamcrest.Matchers.greaterThan(0))
    }

    @Test
    fun `GIVEN multi-segmented organism THEN fastaIds in metadata match FASTA headers`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(
            organism = OTHER_ORGANISM,
            groupId = groupId,
        )

        val response = submissionControllerClient.getOriginalData(
            organism = OTHER_ORGANISM,
            groupId = groupId,
        )
            .andExpect(status().isOk)
            .andReturn()
            .response

        await().until { response.isCommitted }

        val zipContent = response.contentAsByteArray
        val (metadataTsv, sequencesFasta) = extractZipContents(zipContent)

        val lines = metadataTsv.lines().filter { it.isNotBlank() }
        val header = lines[0].split("\t")
        val fastaIdsIndex = header.indexOf("fastaIds")

        val allFastaIdsFromMetadata = lines.drop(1)
            .flatMap { it.split("\t")[fastaIdsIndex].split(" ") }
            .toSet()

        val fastaHeaderIds = sequencesFasta.lines()
            .filter { it.startsWith(">") }
            .map { it.removePrefix(">") }
            .toSet()

        assertThat(fastaHeaderIds, `is`(allFastaIdsFromMetadata))
    }

    private fun extractZipContents(zipContent: ByteArray): Pair<String, String> {
        var metadataTsv = ""
        var sequencesFasta = ""

        ZipInputStream(ByteArrayInputStream(zipContent)).use { zis ->
            var entry = zis.nextEntry
            while (entry != null) {
                val content = zis.readBytes().decodeToString()
                when (entry.name) {
                    "metadata.tsv" -> metadataTsv = content
                    "sequences.fasta" -> sequencesFasta = content
                }
                entry = zis.nextEntry
            }
        }

        return Pair(metadataTsv, sequencesFasta)
    }

    private fun submitAndApproveSingleSegmentSequences(submissionIds: List<String>, groupId: Int) {
        for (submissionId in submissionIds) {
            submissionControllerClient.submit(
                metadataFile = SubmitFiles.metadataFileWith(
                    content = "submissionId\tfirstColumn\n$submissionId\tvalue-$submissionId",
                ),
                sequencesFile = SubmitFiles.sequenceFileWith(
                    content = ">$submissionId\n$DUMMY_ORGANISM_MAIN_SEQUENCE",
                ),
                groupId = groupId,
            ).andExpect(status().isOk)
        }

        val accessionVersions = convenienceClient.extractUnprocessedData(numberOfSequenceEntries = submissionIds.size)
            .map { AccessionVersion(it.accession, it.version) }
        convenienceClient.submitProcessedData(
            accessionVersions.map { PreparedProcessedData.successfullyProcessed(it.accession, it.version) },
        )
        convenienceClient.approveProcessedSequenceEntries(accessionVersions)
    }

    private fun getZipFileNames(zipContent: ByteArray): List<String> {
        val fileNames = mutableListOf<String>()
        ZipInputStream(ByteArrayInputStream(zipContent)).use { zis ->
            var entry = zis.nextEntry
            while (entry != null) {
                fileNames.add(entry.name)
                entry = zis.nextEntry
            }
        }
        return fileNames
    }
}
