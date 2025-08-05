package org.loculus.backend.service.submission

import org.hamcrest.MatcherAssert
import org.hamcrest.Matchers.`is`
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Organism
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.utils.FastaEntry
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class UploadDatabaseServiceBatchInsertTest @Autowired constructor(
    private val uploadDatabaseService: UploadDatabaseService,
) {
    companion object {
        private const val UPLOAD_ID = "large-upload"
        private const val PARAM_LIMIT = 65_535
        private const val COLUMNS_PER_ROW = 4
        private const val REQUIRED_ENTRIES = PARAM_LIMIT / COLUMNS_PER_ROW + 1
    }

    @AfterEach
    fun cleanup() {
        uploadDatabaseService.deleteUploadData(UPLOAD_ID)
    }

    @Test
    fun `batch insert sequences larger than parameter limit`() {
        val organism = Organism(DEFAULT_ORGANISM)
        val sequences = List(REQUIRED_ENTRIES) { index ->
            FastaEntry("sample$index", "A")
        }

        uploadDatabaseService.batchInsertSequencesInAuxTable(UPLOAD_ID, organism, sequences)

        val count = transaction {
            SequenceUploadAuxTable.selectAll()
                .filter { it[SequenceUploadAuxTable.sequenceUploadIdColumn] == UPLOAD_ID }
                .count()
        }
        MatcherAssert.assertThat(count.toLong(), `is`(sequences.size.toLong()))
    }
}
