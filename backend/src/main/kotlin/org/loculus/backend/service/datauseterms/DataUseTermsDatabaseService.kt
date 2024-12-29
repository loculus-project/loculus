package org.loculus.backend.service.datauseterms

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

        DataUseTermsTable.batchInsert(accessions) {
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
            description = "Set data use terms to $newDataUseTerms for accessions ${accessions.joinToString()}",
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
