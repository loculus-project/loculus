package org.loculus.backend.service.datauseterms

import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.exceptions.ExposedSQLException
import org.jetbrains.exposed.sql.insert
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

enum class DataUseTermsType {
    RESTRICTED,
    OPEN,
}

data class DataUseTerms(
    val restrictedUntil: LocalDateTime? = null,
    val changeDateTime: LocalDateTime = Clock.System.now().toLocalDateTime(TimeZone.UTC),
    val dataUseTermsType: DataUseTermsType = DataUseTermsType.OPEN,
)

private val log = KotlinLogging.logger { }

@Service
@Transactional
class DataUseTermsDatabaseService {

    fun setNewDataUseTerms(accession: String, username: String, newDataUseTerms: DataUseTerms) {
        log.info {
            "Setting new data use terms for accession $accession. " +
                "Just an entry in the new Table. " +
                "Will be filled with real juicy logic in the next tickets. See #760 ff. "
        }
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)
        try {
            DataUseTermsTable.insert {
                it[accessionColumn] = accession
                it[changeDateColumn] = now
                it[dataUseTermsTypeColumn] = newDataUseTerms.dataUseTermsType
                it[restrictedUntilColumn] = newDataUseTerms.restrictedUntil
                it[userNameColumn] = username
            }
        } catch (e: ExposedSQLException) {
            log.info("Error: ${e.sqlState}")
            throw e
        }
    }
}
