package org.loculus.backend.service.debug

import org.jetbrains.exposed.sql.deleteAll
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.service.datauseterms.DataUseTermsTable
import org.loculus.backend.service.submission.CurrentProcessingPipelineTable
import org.loculus.backend.service.submission.SequenceEntriesPreprocessedDataTable
import org.loculus.backend.service.submission.SequenceEntriesTable
import org.loculus.backend.utils.DateProvider
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class DeleteSequenceDataService(private val dateProvider: DateProvider, private val config: BackendConfig) {
    @Transactional
    fun deleteAllSequenceData() {
        SequenceEntriesTable.deleteAll()
        SequenceEntriesPreprocessedDataTable.deleteAll()
        DataUseTermsTable.deleteAll()
        CurrentProcessingPipelineTable.deleteAll()
        CurrentProcessingPipelineTable.setV1ForOrganismsIfNotExist(
            config.organisms.keys,
            dateProvider.getCurrentDateTime(),
        )
    }
}
