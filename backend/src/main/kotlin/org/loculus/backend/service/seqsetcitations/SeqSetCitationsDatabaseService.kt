package org.loculus.backend.service.seqsetcitations

import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toJavaLocalDateTime
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.update
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AuthorProfile
import org.loculus.backend.api.CitedBy
import org.loculus.backend.api.ResponseSeqSet
import org.loculus.backend.api.SeqSet
import org.loculus.backend.api.SeqSetCitationsConstants
import org.loculus.backend.api.SeqSetRecord
import org.loculus.backend.api.SequenceEntryStatus
import org.loculus.backend.api.Status.APPROVED_FOR_RELEASE
import org.loculus.backend.api.SubmittedSeqSetRecord
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.controller.NotFoundException
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.service.crossref.CrossRefServiceProperties
import org.loculus.backend.service.submission.AccessionPreconditionValidator
import org.loculus.backend.utils.getNextSequenceNumber
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Timestamp
import java.util.*
import javax.sql.DataSource

private val log = KotlinLogging.logger { }

@Service
@Transactional
class SeqSetCitationsDatabaseService(
    private val accessionPreconditionValidator: AccessionPreconditionValidator,
    private val backendConfig: BackendConfig,
    private val crossRefServiceProperties: CrossRefServiceProperties,
    pool: DataSource,
) {
    init {
        Database.connect(pool)
    }

    fun constructSeqsetId(seqsetIdNumber: Long): String = "${backendConfig.accessionPrefix}SS_$seqsetIdNumber"

    fun createSeqSet(
        authenticatedUser: AuthenticatedUser,
        seqSetName: String,
        seqSetRecords: List<SubmittedSeqSetRecord>,
        seqSetDescription: String?,
    ): ResponseSeqSet {
        log.info { "Create seqSet $seqSetName, user ${authenticatedUser.username}" }

        validateSeqSetName(seqSetName)
        validateSeqSetRecords(seqSetRecords)

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val seqsetIdNumber = getNextSequenceNumber("seqset_id_sequence")
        val insertedSet = SeqSetsTable
            .insert {
                it[seqSetId] = constructSeqsetId(seqsetIdNumber)
                it[name] = seqSetName
                it[description] = seqSetDescription ?: ""
                it[seqSetVersion] = 1
                it[createdAt] = now
                it[createdBy] = authenticatedUser.username
            }

        for (record in seqSetRecords) {
            val insertedRecord = SeqSetRecordsTable
                .insert {
                    it[SeqSetRecordsTable.accession] = record.accession
                    it[SeqSetRecordsTable.type] = record.type
                    it[SeqSetRecordsTable.isFocal] = record.isFocal ?: true
                }
            SeqSetToRecordsTable
                .insert {
                    it[SeqSetToRecordsTable.seqSetRecordId] = insertedRecord[SeqSetRecordsTable.seqSetRecordId]
                    it[SeqSetToRecordsTable.seqSetId] = insertedSet[SeqSetsTable.seqSetId]
                    it[SeqSetToRecordsTable.seqSetVersion] = 1
                }
        }

        return ResponseSeqSet(
            insertedSet[SeqSetsTable.seqSetId].toString(),
            insertedSet[SeqSetsTable.seqSetVersion],
        )
    }

    fun updateSeqSet(
        authenticatedUser: AuthenticatedUser,
        seqSetId: String,
        seqSetName: String,
        seqSetRecords: List<SubmittedSeqSetRecord>,
        seqSetDescription: String?,
    ): ResponseSeqSet {
        val username = authenticatedUser.username
        log.info { "Update seqSet $seqSetId, user $username" }

        validateSeqSetName(seqSetName)
        validateSeqSetRecords(seqSetRecords)

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val maxVersion = SeqSetsTable
            .select(SeqSetsTable.seqSetVersion.max())
            .where { SeqSetsTable.seqSetId eq seqSetId and (SeqSetsTable.createdBy eq username) }
            .firstOrNull()
            ?.get(SeqSetsTable.seqSetVersion.max())

        if (maxVersion == null) {
            throw NotFoundException("SeqSet $seqSetId does not exist")
        }

        validateUpdateSeqSetHasChanges(
            oldSeqSet = getSeqSet(seqSetId, maxVersion).first(),
            oldSeqSetRecords = getSeqSetRecords(seqSetId, maxVersion),
            newSeqSetName = seqSetName,
            newSeqSetRecords = seqSetRecords,
            newSeqSetDescription = seqSetDescription,
        )

        val newVersion = maxVersion + 1

        val insertedSet = SeqSetsTable
            .insert {
                it[SeqSetsTable.seqSetId] = seqSetId
                it[SeqSetsTable.name] = seqSetName
                it[SeqSetsTable.description] = seqSetDescription ?: ""
                it[SeqSetsTable.seqSetVersion] = newVersion
                it[SeqSetsTable.createdAt] = now
                it[SeqSetsTable.createdBy] = username
            }

        for (record in seqSetRecords) {
            val existingRecord = SeqSetRecordsTable
                .selectAll()
                .where {
                    (SeqSetRecordsTable.accession eq record.accession) and
                        (SeqSetRecordsTable.isFocal eq record.isFocal)
                }
                .singleOrNull()

            val seqSetRecordId = if (existingRecord == null) {
                val insertedRecord = SeqSetRecordsTable
                    .insert {
                        it[SeqSetRecordsTable.accession] = record.accession
                        it[SeqSetRecordsTable.type] = record.type
                        it[SeqSetRecordsTable.isFocal] = record.isFocal ?: true
                    }
                insertedRecord[SeqSetRecordsTable.seqSetRecordId]
            } else {
                existingRecord[SeqSetRecordsTable.seqSetRecordId]
            }

            SeqSetToRecordsTable
                .insert {
                    it[SeqSetToRecordsTable.seqSetVersion] = newVersion
                    it[SeqSetToRecordsTable.seqSetId] = insertedSet[SeqSetsTable.seqSetId]
                    it[SeqSetToRecordsTable.seqSetRecordId] = seqSetRecordId
                }
        }

        return ResponseSeqSet(
            insertedSet[SeqSetsTable.seqSetId].toString(),
            insertedSet[SeqSetsTable.seqSetVersion],
        )
    }

    fun getSeqSet(seqSetId: String, version: Long?): List<SeqSet> {
        log.info { "Get seqSet $seqSetId, version $version" }

        val query = SeqSetsTable
            .selectAll()
            .where { SeqSetsTable.seqSetId eq seqSetId }

        if (version != null) {
            query.andWhere { SeqSetsTable.seqSetVersion eq version }
        }

        if (query.empty()) {
            throw NotFoundException("SeqSet $seqSetId, version $version does not exist")
        }

        return query.map { row ->
            SeqSet(
                row[SeqSetsTable.seqSetId],
                row[SeqSetsTable.seqSetVersion],
                row[SeqSetsTable.name],
                Timestamp.valueOf(row[SeqSetsTable.createdAt].toJavaLocalDateTime()),
                row[SeqSetsTable.createdBy],
                row[SeqSetsTable.description],
                row[SeqSetsTable.seqSetDOI],
            )
        }
    }

    fun getSeqSetRecords(seqSetId: String, version: Long?): List<SeqSetRecord> {
        log.info { "Get seqSet records for seqSet $seqSetId, version $version" }

        var selectedVersion = version

        if (selectedVersion == null) {
            selectedVersion = SeqSetsTable
                .select(SeqSetsTable.seqSetVersion.max())
                .where { SeqSetsTable.seqSetId eq seqSetId }
                .singleOrNull()?.get(SeqSetsTable.seqSetVersion)
        }
        if (selectedVersion == null) {
            throw NotFoundException("SeqSet $seqSetId does not exist")
        }

        if (SeqSetToRecordsTable
                .selectAll().where {
                    (SeqSetToRecordsTable.seqSetId eq seqSetId) and
                        (SeqSetToRecordsTable.seqSetVersion eq selectedVersion)
                }
                .empty()
        ) {
            throw NotFoundException("SeqSet $seqSetId, version $selectedVersion does not exist")
        }

        val selectedSeqSetRecords = SeqSetToRecordsTable
            .innerJoin(SeqSetRecordsTable)
            .selectAll()
            .where {
                (SeqSetToRecordsTable.seqSetId eq seqSetId) and
                    (SeqSetToRecordsTable.seqSetVersion eq selectedVersion)
            }
            .map {
                SeqSetRecord(
                    it[SeqSetRecordsTable.seqSetRecordId],
                    it[SeqSetRecordsTable.accession],
                    it[SeqSetRecordsTable.type],
                    it[SeqSetRecordsTable.isFocal],
                )
            }

        return selectedSeqSetRecords
    }

    fun getSeqSets(authenticatedUser: AuthenticatedUser): List<SeqSet> {
        val username = authenticatedUser.username
        log.info { "Get seqSets for user $username" }

        val selectedSeqSets = SeqSetsTable
            .selectAll()
            .where { SeqSetsTable.createdBy eq username }

        return selectedSeqSets.map {
            SeqSet(
                it[SeqSetsTable.seqSetId],
                it[SeqSetsTable.seqSetVersion],
                it[SeqSetsTable.name],
                Timestamp.valueOf(it[SeqSetsTable.createdAt].toJavaLocalDateTime()),
                it[SeqSetsTable.createdBy],
                it[SeqSetsTable.description],
                it[SeqSetsTable.seqSetDOI],
            )
        }
    }

    fun deleteSeqSet(authenticatedUser: AuthenticatedUser, seqSetId: String, version: Long) {
        val username = authenticatedUser.username
        log.info { "Delete seqSet $seqSetId, version $version, user $username" }

        val seqSetDOI = SeqSetsTable
            .selectAll()
            .where {
                (SeqSetsTable.seqSetId eq seqSetId) and (SeqSetsTable.seqSetVersion eq version) and
                    (SeqSetsTable.createdBy eq username)
            }
            .singleOrNull()
            ?.get(SeqSetsTable.seqSetDOI)

        if (seqSetDOI != null) {
            throw UnprocessableEntityException("SeqSet $seqSetId, version $version has a DOI and cannot be deleted")
        }

        SeqSetsTable.deleteWhere {
            (SeqSetsTable.seqSetId eq seqSetId) and
                (SeqSetsTable.seqSetVersion eq version) and
                (SeqSetsTable.createdBy eq username)
        }
    }

    fun validateCreateSeqSetDOI(username: String, seqSetId: String, version: Long) {
        log.info { "Validate create DOI for seqSet $seqSetId, version $version, user $username" }

        if (SeqSetsTable
                .selectAll()
                .where {
                    (SeqSetsTable.seqSetId eq seqSetId) and (SeqSetsTable.seqSetVersion eq version) and
                        (SeqSetsTable.createdBy eq username)
                }
                .empty()
        ) {
            throw NotFoundException("SeqSet $seqSetId, version $version does not exist")
        }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC).toJavaLocalDateTime()
        val sevenDaysAgo = LocalDateTime.parse(now.minusDays(7).toString())
        val count = SeqSetsTable
            .selectAll()
            .where {
                (SeqSetsTable.createdBy eq username) and (SeqSetsTable.createdAt greaterEq sevenDaysAgo) and
                    (SeqSetsTable.seqSetDOI neq "")
            }
            .count()
        if (count >= SeqSetCitationsConstants.DOI_WEEKLY_RATE_LIMIT) {
            throw UnprocessableEntityException(
                "User exceeded limit of ${SeqSetCitationsConstants.DOI_WEEKLY_RATE_LIMIT} DOIs created per week.",
            )
        }
    }

    fun createSeqSetDOI(authenticatedUser: AuthenticatedUser, seqSetId: String, version: Long): ResponseSeqSet {
        val username = authenticatedUser.username
        log.info { "Create DOI for seqSet $seqSetId, version $version, user $username" }

        validateCreateSeqSetDOI(username, seqSetId, version)

        val doiPrefix = crossRefServiceProperties.doiPrefix ?: "no-prefix-configured"
        val seqSetDOI = "$doiPrefix/$seqSetId.$version"

        SeqSetsTable.update(
            {
                (SeqSetsTable.seqSetId eq seqSetId) and
                    (SeqSetsTable.seqSetVersion eq version) and
                    (SeqSetsTable.createdBy eq username)
            },
        ) {
            it[SeqSetsTable.seqSetDOI] = seqSetDOI
        }

        return ResponseSeqSet(
            seqSetId,
            version,
        )
    }

    fun getUserCitedBySeqSet(userAccessions: List<SequenceEntryStatus>): CitedBy {
        log.info { "Get user cited by seqSet" }

        data class SeqSetWithAccession(
            val accession: String,
            val seqSetId: String,
            val seqSetVersion: Long,
            val createdAt: Timestamp,
        )

        val userAccessionStrings = userAccessions.flatMap {
            listOf(it.accession.plus('.').plus(it.version), it.accession)
        }

        val maxSeqSetVersion = SeqSetsTable.seqSetVersion.max().alias("max_version")
        val maxVersionPerSeqSet = SeqSetsTable
            .select(SeqSetsTable.seqSetId, maxSeqSetVersion)
            .groupBy(SeqSetsTable.seqSetId)
            .alias("maxVersionPerSeqSet")

        val latestSeqSetWithUserAccession = SeqSetRecordsTable
            .innerJoin(SeqSetToRecordsTable)
            .innerJoin(SeqSetsTable)
            .join(
                maxVersionPerSeqSet,
                JoinType.INNER,
                additionalConstraint = {
                    (SeqSetToRecordsTable.seqSetId eq maxVersionPerSeqSet[SeqSetsTable.seqSetId]) and
                        (SeqSetToRecordsTable.seqSetVersion eq maxVersionPerSeqSet[maxSeqSetVersion])
                },
            )
            .selectAll()
            .where { (SeqSetRecordsTable.accession inList userAccessionStrings) }
            .map {
                SeqSetWithAccession(
                    it[SeqSetRecordsTable.accession],
                    it[SeqSetToRecordsTable.seqSetId],
                    it[SeqSetToRecordsTable.seqSetVersion],
                    Timestamp.valueOf(it[SeqSetsTable.createdAt].toJavaLocalDateTime()),
                )
            }

        val citedBy = CitedBy(
            mutableListOf(),
            mutableListOf(),
        )

        val uniqueSeqSetIds = latestSeqSetWithUserAccession.map { it.seqSetId.toString() }.toSet()
        for (seqSetId in uniqueSeqSetIds) {
            val year = latestSeqSetWithUserAccession
                .first { it.seqSetId.toString() == seqSetId }
                .createdAt.toLocalDateTime().year.toLong()
            if (citedBy.years.contains(year)) {
                val index = citedBy.years.indexOf(year)
                while (index >= citedBy.citations.size) {
                    citedBy.citations.add(0)
                }
                citedBy.citations[index] = citedBy.citations[index] + 1
            } else {
                citedBy.years.add(year)
                citedBy.citations.add(1)
            }
        }

        return citedBy
    }

    fun getSeqSetCitedByPublication(seqSetId: String, version: Long): CitedBy {
        // TODO: implement after registering to CrossRef API
        // https://github.com/orgs/loculus-project/projects/3/views/1?pane=issue&itemId=50282833

        log.info { "Get seqSet cited by publication for seqSetId $seqSetId, version $version" }

        val citedBy = CitedBy(
            mutableListOf(),
            mutableListOf(),
        )

        return citedBy
    }

    fun validateSeqSetRecords(seqSetRecords: List<SubmittedSeqSetRecord>) {
        if (seqSetRecords.isEmpty()) {
            throw UnprocessableEntityException("SeqSet must contain at least one record")
        }

        val uniqueAccessions = seqSetRecords.map { it.accession }.toSet()
        if (uniqueAccessions.size != seqSetRecords.size) {
            throw UnprocessableEntityException("SeqSet must not contain duplicate accessions")
        }

        val accessionsWithoutVersions = seqSetRecords.filter { !it.accession.contains('.') }.map { it.accession }
        accessionPreconditionValidator.validate {
            thatAccessionsExist(accessionsWithoutVersions)
                .andThatSequenceEntriesAreInStates(listOf(APPROVED_FOR_RELEASE))
        }
        val accessionsWithVersions = try {
            seqSetRecords
                .filter { it.accession.contains('.') }
                .map {
                    val (accession, version) = it.accession.split('.')
                    AccessionVersion(accession, version.toLong())
                }
        } catch (e: NumberFormatException) {
            throw UnprocessableEntityException("Accession versions must be integers")
        }

        accessionPreconditionValidator.validate {
            thatAccessionVersionsExist(accessionsWithVersions)
                .andThatSequenceEntriesAreInStates(listOf(APPROVED_FOR_RELEASE))
        }
    }

    fun validateSeqSetName(name: String) {
        if (name.isBlank()) {
            throw UnprocessableEntityException("SeqSet name must not be empty")
        }
    }

    fun validateUpdateSeqSetHasChanges(
        oldSeqSet: SeqSet,
        oldSeqSetRecords: List<SeqSetRecord>,
        newSeqSetName: String,
        newSeqSetRecords: List<SubmittedSeqSetRecord>,
        newSeqSetDescription: String?,
    ) {
        val oldSubmittedSeqSetRecords = oldSeqSetRecords.map {
            SubmittedSeqSetRecord(
                it.accession,
                it.type,
                it.isFocal,
            )
        }

        if (oldSeqSet.name == newSeqSetName &&
            oldSeqSet.description == newSeqSetDescription &&
            oldSubmittedSeqSetRecords == newSeqSetRecords
        ) {
            throw UnprocessableEntityException("SeqSet update must contain at least one change")
        }
    }

    fun transformKeycloakUserToAuthorProfile(keycloakUser: UserRepresentation): AuthorProfile {
        val emailDomain = keycloakUser.email?.substringAfterLast("@") ?: ""
        return AuthorProfile(
            keycloakUser.username,
            keycloakUser.firstName,
            keycloakUser.lastName,
            emailDomain,
            keycloakUser.attributes["university"]?.firstOrNull(),
        )
    }
}
