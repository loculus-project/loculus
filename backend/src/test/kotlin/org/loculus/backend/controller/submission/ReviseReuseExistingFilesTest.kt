package org.loculus.backend.controller.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_SIMPLE_FILE_CONTENT
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.S3_CONFIG
import org.loculus.backend.controller.files.FilesClient
import org.loculus.backend.controller.files.andGetFileIdsAndUrls
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForAlternativeUser
import org.loculus.backend.controller.jwtForDefaultUser
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.shaded.org.awaitility.Awaitility.await
import java.util.UUID

private const val FILE_CATEGORY = "myFileCategory"
private const val EXISTING_FILES_COLUMN = "existingFiles_$FILE_CATEGORY"

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$S3_CONFIG"],
)
class ReviseReuseExistingFilesTest(
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
    @Autowired val filesClient: FilesClient,
) {
    @Test
    fun `WHEN revising with existingFiles columns THEN files are kept, added, removed and overridden`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        val submissionResult = convenienceClient.submitDefaultFiles(groupId = groupId, includeFileMapping = true)
        processAndApproveAll()

        // The original files attached at submission, keyed by submission id (each is `hello.txt`).
        val originalFileIds = submissionResult.submissionIdFilesMap!!
            .mapValues { (_, categories) -> categories.getValue(FILE_CATEGORY).single().fileId }

        val (metadataTsv, sequencesFasta) = downloadSubmittedData(groupId)
        val table = MetadataTable.parse(metadataTsv)

        // The download lists the currently attached file for every entry.
        table.ids.forEach { id ->
            assertThat(
                table.row(id).files(),
                `is`(setOf("hello.txt" to originalFileIds.getValue(id))),
            )
        }

        // Upload the new files that will be added / used to override during the revision.
        val (addedFileId, overrideFileId) = uploadFiles(groupId, "added", "override")

        // custom1: remove all files by blanking the cell. custom2..9 keep their file unchanged.
        table.setCell("custom1", EXISTING_FILES_COLUMN, "")

        val fileMapping = mapOf(
            // custom0: keep `hello.txt` (untouched column) and add a brand-new file.
            "custom0" to mapOf(FILE_CATEGORY to listOf(FileIdAndName(addedFileId, "added.txt"))),
            // custom2: a freshly uploaded file with the same name as the kept one must win.
            "custom2" to mapOf(FILE_CATEGORY to listOf(FileIdAndName(overrideFileId, "hello.txt"))),
        )

        submissionControllerClient.reviseSequenceEntries(
            metadataFile = MockMultipartFile(
                "metadataFile",
                "metadata.tsv",
                MediaType.TEXT_PLAIN_VALUE,
                table.render().toByteArray(),
            ),
            sequencesFile = MockMultipartFile(
                "sequenceFile",
                "sequences.fasta",
                MediaType.TEXT_PLAIN_VALUE,
                sequencesFasta.toByteArray(),
            ),
            fileMapping = fileMapping,
            jwt = jwtForDefaultUser,
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("\$.length()").value(SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES))

        processAndApproveAll()

        val revisedTable = MetadataTable.parse(downloadSubmittedData(groupId).first)

        assertThat(
            revisedTable.row("custom0").files(),
            `is`(setOf("hello.txt" to originalFileIds.getValue("custom0"), "added.txt" to addedFileId)),
        )
        assertThat(revisedTable.row("custom1").files(), `is`(emptySet()))
        assertThat(revisedTable.row("custom2").files(), `is`(setOf("hello.txt" to overrideFileId)))
        assertThat(
            revisedTable.row("custom3").files(),
            `is`(setOf("hello.txt" to originalFileIds.getValue("custom3"))),
        )
    }

    @Test
    fun `GIVEN existingFiles referencing a file from another group WHEN revised THEN the request is rejected`() {
        val groupId = groupManagementClient.createNewGroup().andGetGroupId()
        convenienceClient.submitDefaultFiles(groupId = groupId, includeFileMapping = true)
        processAndApproveAll()

        val otherGroupId = groupManagementClient.createNewGroup(jwt = jwtForAlternativeUser).andGetGroupId()
        val otherGroupFile = filesClient.requestUploads(groupId = otherGroupId, jwt = jwtForAlternativeUser)
            .andGetFileIdsAndUrls()[0]
        convenienceClient.uploadFile(
            otherGroupFile.presignedWriteUrl,
            DEFAULT_SIMPLE_FILE_CONTENT,
            otherGroupFile.headers,
        )

        val (metadataTsv, sequencesFasta) = downloadSubmittedData(groupId)
        val table = MetadataTable.parse(metadataTsv)
        table.setCell("custom0", EXISTING_FILES_COLUMN, "stolen.txt:${otherGroupFile.fileId}")

        submissionControllerClient.reviseSequenceEntries(
            metadataFile = MockMultipartFile(
                "metadataFile",
                "metadata.tsv",
                MediaType.TEXT_PLAIN_VALUE,
                table.render().toByteArray(),
            ),
            sequencesFile = MockMultipartFile(
                "sequenceFile",
                "sequences.fasta",
                MediaType.TEXT_PLAIN_VALUE,
                sequencesFasta.toByteArray(),
            ),
            jwt = jwtForDefaultUser,
        )
            .andExpect(status().isBadRequest)
            .andExpect(content().contentType(MediaType.APPLICATION_PROBLEM_JSON))
            .andExpect(jsonPath("\$.detail").value("File ${otherGroupFile.fileId} does not belong to group $groupId."))
    }

    private fun uploadFiles(groupId: Int, vararg names: String): List<UUID> {
        val fileIdsAndUrls = filesClient.requestUploads(groupId, names.size).andGetFileIdsAndUrls()
        return names.mapIndexed { index, name ->
            convenienceClient.uploadFile(
                fileIdsAndUrls[index].presignedWriteUrl,
                "$name content",
                fileIdsAndUrls[index].headers,
            )
            fileIdsAndUrls[index].fileId
        }
    }

    /** Extract released sequences to processing, submit processed data preserving the submitted files, and approve. */
    private fun processAndApproveAll() {
        val unprocessed = convenienceClient.extractUnprocessedData()
        val processed = unprocessed.map { entry ->
            val base = PreparedProcessedData.successfullyProcessed(accession = entry.accession, version = entry.version)
            val files = entry.data.files?.mapValues { (_, list) -> list.map { FileIdAndName(it.fileId, it.name) } }
            base.copy(data = base.data.copy(files = files))
        }
        convenienceClient.submitProcessedData(processed)
        convenienceClient.approveProcessedSequenceEntries(
            unprocessed.map {
                AccessionVersion(it.accession, it.version)
            },
        )
    }

    private fun downloadSubmittedData(groupId: Int): Pair<String, String> {
        val response = submissionControllerClient.getSubmittedData(groupId = groupId)
            .andExpect(status().isOk)
            .andReturn()
            .response
        await().until { response.isCommitted }
        return extractSubmittedDataZipContents(response.contentAsByteArray)
    }
}

/** A minimal editable view of a downloaded metadata TSV, keyed by the `id` column. */
private class MetadataTable(val headers: List<String>, val rows: List<MutableList<String>>) {
    private val idIndex = headers.indexOf("id").also { require(it >= 0) { "metadata is missing the 'id' column" } }
    private val fileColumnIndex = headers.indexOf(EXISTING_FILES_COLUMN)
        .also { require(it >= 0) { "metadata is missing the '$EXISTING_FILES_COLUMN' column" } }

    inner class Row(private val cells: List<String>) {
        /** The (name, fileId) pairs encoded in the `existingFiles_<category>` cell. */
        fun files(): Set<Pair<String, UUID>> = cells[fileColumnIndex]
            .split("|")
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .map {
                val separator = it.lastIndexOf(':')
                it.substring(0, separator) to UUID.fromString(it.substring(separator + 1))
            }
            .toSet()
    }

    fun row(id: String): Row = Row(rows.first { it[idIndex] == id })

    val ids: List<String> get() = rows.map { it[idIndex] }

    fun setCell(id: String, column: String, value: String) {
        val columnIndex = headers.indexOf(column)
        rows.first { it[idIndex] == id }[columnIndex] = value
    }

    fun render(): String = (listOf(headers) + rows).joinToString("\n") { it.joinToString("\t") }

    companion object {
        fun parse(tsv: String): MetadataTable {
            val lines = tsv.lines().filter { it.isNotBlank() }
            val headers = lines[0].split("\t")
            val rows = lines.drop(1).map { line ->
                line.split("\t").toMutableList().apply {
                    while (size < headers.size) add("")
                }
            }
            return MetadataTable(headers, rows)
        }
    }
}
