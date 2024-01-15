package org.loculus.backend.service.licenses

import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.exceptions.ExposedSQLException
import org.jetbrains.exposed.sql.insert
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

enum class LicenseType {
    RESTRICTED,
    OPEN,
}

data class License(
    val restrictedUntil: LocalDateTime? = null,
    val changeDateTime: LocalDateTime = Clock.System.now().toLocalDateTime(TimeZone.UTC),
    val licenseType: LicenseType = LicenseType.OPEN,
)

private val log = KotlinLogging.logger { }

@Service
@Transactional
class LicensesDatabaseService() {

    fun setNewLicense(accession: String, username: String, newLicense: License) {
        log.info {
            "Setting new license for accession $accession. " +
                "Just an entry in the new Table. " +
                "Will be filled with real juicy logic in the next tickets. See #760 ff. "
        }
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)
        try {
            LicensesTable.insert {
                it[accessionColumn] = accession
                it[changeDateColumn] = now
                it[licenseTypeColumn] = newLicense.licenseType.name
                it[restrictedUntilColumn] = newLicense.restrictedUntil
                it[submitterColumn] = username
            }
        } catch (e: ExposedSQLException) {
            log.info("Error: ${e.sqlState}")
            throw e
        }
    }
}
