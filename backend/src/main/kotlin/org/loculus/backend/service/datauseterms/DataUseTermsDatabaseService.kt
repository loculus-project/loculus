package org.loculus.backend.service.datauseterms

import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.statements.StatementType
import org.jetbrains.exposed.sql.transactions.TransactionManager
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsHistoryEntry
import org.loculus.backend.api.DataUseTermsType
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.controller.NotFoundException
import org.loculus.backend.log.AuditLogger
import org.loculus.backend.service.submission.AccessionPreconditionValidator
import org.loculus.backend.service.submission.MetadataUploadAuxTable
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.processInDatabaseSafeChunks
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

    fun setInitialDataUseTerms(
        authenticatedUser: AuthenticatedUser,
        uploadId: String,
        expectedCount: Int,
        newDataUseTerms: DataUseTerms,
    ) {
        dataUseTermsPreconditionValidator.checkThatRestrictedUntilDateValid(newDataUseTerms)
        val now = dateProvider.getCurrentDateTime()
        val restrictedUntil = when (newDataUseTerms) {
            is DataUseTerms.Restricted -> newDataUseTerms.restrictedUntil
            else -> null
        }
        val sql = """
            WITH inserted AS (
                INSERT INTO data_use_terms_table (
                    accession,
                    change_date,
                    data_use_terms_type,
                    restricted_until,
                    user_name
                )
                SELECT
                    accession,
                    ?,
                    ?,
                    ?,
                    ?
                FROM metadata_upload_aux_table
                WHERE upload_id = ?
                RETURNING accession
            )
            SELECT COUNT(*) AS inserted_count
            FROM inserted
        """.trimIndent()

        val insertedCount = TransactionManager.current().exec(
            sql,
            args = listOf(
                DataUseTermsTable.changeDateColumn.columnType to now,
                DataUseTermsTable.dataUseTermsTypeColumn.columnType to newDataUseTerms.type.toString(),
                DataUseTermsTable.restrictedUntilColumn.columnType to restrictedUntil,
                DataUseTermsTable.userNameColumn.columnType to authenticatedUser.username,
                MetadataUploadAuxTable.uploadIdColumn.columnType to uploadId,
            ),
            explicitStatementType = StatementType.SELECT,
        ) { resultSet ->
            if (resultSet.next()) resultSet.getInt("inserted_count") else 0
        } ?: 0

        if (insertedCount != expectedCount) {
            throw IllegalStateException(
                "Expected to set initial data use terms for $expectedCount accessions in upload $uploadId, " +
                    "but inserted $insertedCount.",
            )
        }

        auditLogger.log(
            username = authenticatedUser.username,
            description = "Set data use terms to $newDataUseTerms for $insertedCount accessions in upload $uploadId",
        )
    }

    fun setNewDataUseTerms(
        authenticatedUser: AuthenticatedUser,
        accessions: List<Accession>,
        newDataUseTerms: DataUseTerms,
    ) {
        val now = dateProvider.getCurrentDateTime()

        accessions.processInDatabaseSafeChunks { chunk ->
            accessionPreconditionValidator.validate {
                thatAccessionsExist(chunk)
                    .andThatUserIsAllowedToEditSequenceEntries(authenticatedUser)
            }

            dataUseTermsPreconditionValidator.checkThatTransitionIsAllowed(chunk, newDataUseTerms)

            DataUseTermsTable.batchInsert(chunk) {
                this[DataUseTermsTable.accessionColumn] = it
                this[DataUseTermsTable.changeDateColumn] = now
                this[DataUseTermsTable.dataUseTermsTypeColumn] = newDataUseTerms.type.toString()
                this[DataUseTermsTable.restrictedUntilColumn] = when (newDataUseTerms) {
                    is DataUseTerms.Restricted -> newDataUseTerms.restrictedUntil
                    else -> null
                }
                this[DataUseTermsTable.userNameColumn] = authenticatedUser.username
            }
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
