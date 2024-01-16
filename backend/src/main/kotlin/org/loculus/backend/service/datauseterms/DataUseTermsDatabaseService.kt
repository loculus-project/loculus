package org.loculus.backend.service.datauseterms

import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.sql.batchInsert
import org.loculus.backend.api.DataUseTerms
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

private val log = KotlinLogging.logger { }

@Service
@Transactional
class DataUseTermsDatabaseService {

    fun setNewDataUseTerms(accessions: List<String>, username: String, newDataUseTerms: DataUseTerms) {
        log.info {
            "Setting new data use terms for accessions $accessions. " +
                "Just an entry in the new Table. " +
                "Will be filled with real juicy logic in the next tickets. See #760 ff. "
        }
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        DataUseTermsTable.batchInsert(accessions) {
            this[DataUseTermsTable.accessionColumn] = it
            this[DataUseTermsTable.changeDateColumn] = now
            this[DataUseTermsTable.dataUseTermsTypeColumn] = newDataUseTerms.type
            this[DataUseTermsTable.restrictedUntilColumn] = when (newDataUseTerms) {
                is DataUseTerms.Restricted -> {
                    newDataUseTerms.restrictedUntil
                }

                else -> {
                    null
                }
            }
            this[DataUseTermsTable.userNameColumn] = username
        }
    }
}
