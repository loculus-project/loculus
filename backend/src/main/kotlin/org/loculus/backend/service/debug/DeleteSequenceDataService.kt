package org.loculus.backend.service.debug

import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import org.jetbrains.exposed.sql.deleteAll
import org.jetbrains.exposed.sql.insert
import org.loculus.backend.service.datauseterms.DataUseTermsTable
import org.loculus.backend.service.submission.CurrentProcessingPipelineTable
import org.loculus.backend.service.submission.MetadataUploadAuxTable
import org.loculus.backend.service.submission.SequenceEntriesPreprocessedDataTable
import org.loculus.backend.service.submission.SequenceEntriesTable
import org.loculus.backend.service.submission.SequenceUploadAuxTable
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class DeleteSequenceDataService {
    @Transactional
    fun deleteAllSequenceData() {
        SequenceEntriesTable.deleteAll()
        SequenceEntriesPreprocessedDataTable.deleteAll()
        MetadataUploadAuxTable.deleteAll()
        SequenceUploadAuxTable.deleteAll()
        DataUseTermsTable.deleteAll()
        CurrentProcessingPipelineTable.deleteAll()
        CurrentProcessingPipelineTable.insert {
            it[versionColumn] = 1
            it[startedUsingAtColumn] = Clock.System.now().toLocalDateTime(TimeZone.UTC)
        }
    }
}
