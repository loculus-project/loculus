package org.loculus.backend.service.datauseterms

import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.selectAll
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsHistoryEntry
import org.loculus.backend.api.DataUseTermsType
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.controller.NotFoundException
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.service.submission.AccessionPreconditionValidator
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.DateProvider
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional
class DataUseTermsDatabaseService(
    private val accessionPreconditionValidator: AccessionPreconditionValidator,
    private val dataUseTermsPreconditionValidator: DataUseTermsPreconditionValidator,
    private val auditLogger: AuditLogger,
    private val dateProvider: DateProvider,
) {

    private fun getCurrentDataUseTerms(accession: Accession): DataUseTerms? {
        return DataUseTermsTable
            .selectAll()
            .where { DataUseTermsTable.accessionColumn eq accession }
            .orderBy(DataUseTermsTable.changeDateColumn, SortOrder.DESC)
            .limit(1)
            .firstOrNull()
            ?.let { row ->
                val type = DataUseTermsType.fromString(row[DataUseTermsTable.dataUseTermsTypeColumn])
                val restrictedUntilDate = row[DataUseTermsTable.restrictedUntilColumn] // This is kotlinx.datetime.LocalDate?
                DataUseTerms.fromParameters(type, restrictedUntilDate)
            }
    }

    fun setNewDataUseTerms(
        authenticatedUser: AuthenticatedUser,
        accessions: List<Accession>,
        newDataUseTerms: DataUseTerms,
    ) {
        val now = dateProvider.getCurrentDateTime()

        accessionPreconditionValidator.validate {
            thatAccessionsExist(accessions)
                .andThatUserIsAllowedToEditSequenceEntries(authenticatedUser)
        }

        dataUseTermsPreconditionValidator.checkThatTransitionIsAllowed(accessions, newDataUseTerms)
        dataUseTermsPreconditionValidator.checkThatRestrictedUntilIsAllowed(newDataUseTerms)

        val accessionsToUpdate = accessions.filter { accession ->
            val currentDataUseTerms = getCurrentDataUseTerms(accession)
            currentDataUseTerms == null || currentDataUseTerms != newDataUseTerms
        }

        if (accessionsToUpdate.isEmpty()) {
            auditLogger.log(
                username = authenticatedUser.username,
                description = "Attempted to set data use terms to $newDataUseTerms for accessions ${accessions.joinToString()}, but terms were already up-to-date. No changes made."
            )
            return
        }

        DataUseTermsTable.batchInsert(accessionsToUpdate) {
            this[DataUseTermsTable.accessionColumn] = it
            this[DataUseTermsTable.changeDateColumn] = now
            this[DataUseTermsTable.dataUseTermsTypeColumn] = newDataUseTerms.type.toString()
            this[DataUseTermsTable.restrictedUntilColumn] = when (newDataUseTerms) {
                is DataUseTerms.Restricted -> newDataUseTerms.restrictedUntil
                else -> null
            }
            this[DataUseTermsTable.userNameColumn] = authenticatedUser.username
        }

        auditLogger.log(
            username = authenticatedUser.username,
            description = "Set data use terms to $newDataUseTerms for accessions ${accessionsToUpdate.joinToString()}. " +
                  if (accessionsToUpdate.size < accessions.size) {
                      "Other ${accessions.size - accessionsToUpdate.size} accessions already had these terms and were not updated."
                  } else {
                      ""
                  }
        )
    }

    fun getDataUseTermsHistory(accession: Accession): List<DataUseTermsHistoryEntry> {
        val accessionDataUseTermsHistory = DataUseTermsTable
            .selectAll()
            .where { DataUseTermsTable.accessionColumn eq accession }
            .sortedBy { it[DataUseTermsTable.changeDateColumn] }
            .map {
                DataUseTermsHistoryEntry(
                    accession = it[DataUseTermsTable.accessionColumn],
                    changeDate = it[DataUseTermsTable.changeDateColumn].toString(),
                    dataUseTerms = DataUseTerms.fromParameters(
                        type = DataUseTermsType.fromString(it[DataUseTermsTable.dataUseTermsTypeColumn]),
                        restrictedUntil = it[DataUseTermsTable.restrictedUntilColumn],
                    ),
                    userName = it[DataUseTermsTable.userNameColumn],
                )
            }
        if (accessionDataUseTermsHistory.isEmpty()) {
            throw NotFoundException("Querying data use terms history: Accession $accession not found")
        }
        return accessionDataUseTermsHistory
    }
}
