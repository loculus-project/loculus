package org.loculus.backend.service.datauseterms

import kotlinx.datetime.Clock
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.select
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsHistoryEntry
import org.loculus.backend.api.DataUseTermsType
import org.loculus.backend.controller.NotFoundException
import org.loculus.backend.service.submission.AccessionPreconditionValidator
import org.loculus.backend.utils.Accession
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional
class DataUseTermsDatabaseService(
    private val accessionPreconditionValidator: AccessionPreconditionValidator,
    private val dataUseTermsPreconditionValidator: DataUseTermsPreconditionValidator,
) {

    fun setNewDataUseTerms(username: String, accessions: List<Accession>, newDataUseTerms: DataUseTerms) {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        accessionPreconditionValidator.validateAccessions(
            submitter = username,
            accessions = accessions,
        )

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
            this[DataUseTermsTable.userNameColumn] = username
        }
    }

    fun getDataUseTermsHistory(accession: Accession): List<DataUseTermsHistoryEntry> {
        val accessionDataUseTermsHistory = DataUseTermsTable
            .select { DataUseTermsTable.accessionColumn eq accession }
            .sortedBy { it[DataUseTermsTable.changeDateColumn] }
            .map {
                DataUseTermsHistoryEntry(
                    accession = it[DataUseTermsTable.accessionColumn],
                    changeDate = it[DataUseTermsTable.changeDateColumn].toString(),
                    dataUseTerms = DataUseTerms.fromParameters(
                        type = DataUseTermsType.fromString(it[DataUseTermsTable.dataUseTermsTypeColumn]),
                        restrictedUntilString = it[DataUseTermsTable.restrictedUntilColumn],
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
