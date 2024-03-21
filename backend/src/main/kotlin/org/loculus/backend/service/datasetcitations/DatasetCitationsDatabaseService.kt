package org.loculus.backend.service.datasetcitations

import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toJavaLocalDateTime
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.update
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AuthorProfile
import org.loculus.backend.api.CitedBy
import org.loculus.backend.api.Dataset
import org.loculus.backend.api.DatasetCitationsConstants
import org.loculus.backend.api.DatasetRecord
import org.loculus.backend.api.ResponseDataset
import org.loculus.backend.api.SequenceEntryStatus
import org.loculus.backend.api.Status.APPROVED_FOR_RELEASE
import org.loculus.backend.api.SubmittedDatasetRecord
import org.loculus.backend.controller.NotFoundException
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.service.submission.AccessionPreconditionValidator
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Timestamp
import java.util.UUID
import javax.sql.DataSource

private val log = KotlinLogging.logger { }

@Service
@Transactional
class DatasetCitationsDatabaseService(
    private val accessionPreconditionValidator: AccessionPreconditionValidator,
    pool: DataSource,
) {
    init {
        Database.connect(pool)
    }

    fun createDataset(
        username: String,
        datasetName: String,
        datasetRecords: List<SubmittedDatasetRecord>,
        datasetDescription: String?,
    ): ResponseDataset {
        log.info { "Create dataset $datasetName, user $username" }

        validateDatasetName(datasetName)
        validateDatasetRecords(datasetRecords)

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val insertedSet = DatasetsTable
            .insert {
                it[DatasetsTable.name] = datasetName
                it[DatasetsTable.description] = datasetDescription ?: ""
                it[DatasetsTable.datasetVersion] = 1
                it[DatasetsTable.createdAt] = now
                it[DatasetsTable.createdBy] = username
            }

        for (record in datasetRecords) {
            val insertedRecord = DatasetRecordsTable
                .insert {
                    it[DatasetRecordsTable.accession] = record.accession
                    it[DatasetRecordsTable.type] = record.type
                }
            DatasetToRecordsTable
                .insert {
                    it[DatasetToRecordsTable.datasetRecordId] = insertedRecord[DatasetRecordsTable.datasetRecordId]
                    it[DatasetToRecordsTable.datasetId] = insertedSet[DatasetsTable.datasetId]
                    it[DatasetToRecordsTable.datasetVersion] = 1
                }
        }

        return ResponseDataset(
            insertedSet[DatasetsTable.datasetId].toString(),
            insertedSet[DatasetsTable.datasetVersion],
        )
    }

    fun updateDataset(
        username: String,
        datasetId: String,
        datasetName: String,
        datasetRecords: List<SubmittedDatasetRecord>,
        datasetDescription: String?,
    ): ResponseDataset {
        log.info { "Update dataset $datasetId, user $username" }

        validateDatasetName(datasetName)
        validateDatasetRecords(datasetRecords)

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)

        val datasetUUID = UUID.fromString(datasetId)

        val maxVersion = DatasetsTable
            .slice(DatasetsTable.datasetVersion.max())
            .select { DatasetsTable.datasetId eq datasetUUID and (DatasetsTable.createdBy eq username) }
            .firstOrNull()
            ?.get(DatasetsTable.datasetVersion.max())

        if (maxVersion == null) {
            throw NotFoundException("Dataset $datasetId does not exist")
        }

        validateUpdateDatasetHasChanges(
            oldDataset = getDataset(datasetId, maxVersion).first(),
            oldDatasetRecords = getDatasetRecords(datasetId, maxVersion),
            newDatasetName = datasetName,
            newDatasetRecords = datasetRecords,
            newDatasetDescription = datasetDescription,
        )

        val newVersion = maxVersion + 1

        val insertedSet = DatasetsTable
            .insert {
                it[DatasetsTable.datasetId] = datasetUUID
                it[DatasetsTable.name] = datasetName
                it[DatasetsTable.description] = datasetDescription ?: ""
                it[DatasetsTable.datasetVersion] = newVersion
                it[DatasetsTable.createdAt] = now
                it[DatasetsTable.createdBy] = username
            }

        for (record in datasetRecords) {
            val existingRecord = DatasetRecordsTable
                .select { DatasetRecordsTable.accession eq record.accession }
                .singleOrNull()

            val datasetRecordId = if (existingRecord == null) {
                val insertedRecord = DatasetRecordsTable
                    .insert {
                        it[DatasetRecordsTable.accession] = record.accession
                        it[DatasetRecordsTable.type] = record.type
                    }
                insertedRecord[DatasetRecordsTable.datasetRecordId]
            } else {
                existingRecord[DatasetRecordsTable.datasetRecordId]
            }

            DatasetToRecordsTable
                .insert {
                    it[DatasetToRecordsTable.datasetVersion] = newVersion
                    it[DatasetToRecordsTable.datasetId] = insertedSet[DatasetsTable.datasetId]
                    it[DatasetToRecordsTable.datasetRecordId] = datasetRecordId
                }
        }

        return ResponseDataset(
            insertedSet[DatasetsTable.datasetId].toString(),
            insertedSet[DatasetsTable.datasetVersion],
        )
    }

    fun getDataset(datasetId: String, version: Long?): List<Dataset> {
        log.info { "Get dataset $datasetId, version $version" }

        val query = DatasetsTable
            .select {
                DatasetsTable.datasetId eq UUID.fromString(datasetId)
            }

        if (version != null) {
            query.andWhere { DatasetsTable.datasetVersion eq version }
        }

        if (query.empty()) {
            throw NotFoundException("Dataset $datasetId, version $version does not exist")
        }

        return query.map { row ->
            Dataset(
                row[DatasetsTable.datasetId],
                row[DatasetsTable.datasetVersion],
                row[DatasetsTable.name],
                Timestamp.valueOf(row[DatasetsTable.createdAt].toJavaLocalDateTime()),
                row[DatasetsTable.createdBy],
                row[DatasetsTable.description],
                row[DatasetsTable.datasetDOI],
            )
        }
    }

    fun getDatasetRecords(datasetId: String, version: Long?): List<DatasetRecord> {
        log.info { "Get dataset records for dataset $datasetId, version $version" }

        var selectedVersion = version

        val datasetUuid = UUID.fromString(datasetId)

        if (selectedVersion == null) {
            selectedVersion = DatasetsTable
                .slice(DatasetsTable.datasetVersion.max())
                .select { DatasetsTable.datasetId eq datasetUuid }
                .singleOrNull()?.get(DatasetsTable.datasetVersion)
        }
        if (selectedVersion == null) {
            throw NotFoundException("Dataset $datasetId does not exist")
        }

        if (DatasetToRecordsTable
                .select {
                    (DatasetToRecordsTable.datasetId eq datasetUuid) and
                        (DatasetToRecordsTable.datasetVersion eq selectedVersion)
                }
                .empty()
        ) {
            throw NotFoundException("Dataset $datasetId, version $selectedVersion does not exist")
        }

        val selectedDatasetRecords = DatasetToRecordsTable
            .innerJoin(DatasetRecordsTable)
            .select {
                (DatasetToRecordsTable.datasetId eq datasetUuid) and
                    (DatasetToRecordsTable.datasetVersion eq selectedVersion)
            }
            .map {
                DatasetRecord(
                    it[DatasetRecordsTable.datasetRecordId],
                    it[DatasetRecordsTable.accession],
                    it[DatasetRecordsTable.type],
                )
            }

        return selectedDatasetRecords
    }

    fun getDatasets(username: String): List<Dataset> {
        log.info { "Get datasets for user $username" }

        val selectedDatasets = DatasetsTable
            .select { DatasetsTable.createdBy eq username }

        return selectedDatasets.map {
            Dataset(
                it[DatasetsTable.datasetId],
                it[DatasetsTable.datasetVersion],
                it[DatasetsTable.name],
                Timestamp.valueOf(it[DatasetsTable.createdAt].toJavaLocalDateTime()),
                it[DatasetsTable.createdBy],
                it[DatasetsTable.description],
                it[DatasetsTable.datasetDOI],
            )
        }
    }

    fun deleteDataset(username: String, datasetId: String, version: Long) {
        log.info { "Delete dataset $datasetId, version $version, user $username" }

        val datasetUuid = UUID.fromString(datasetId)

        val datasetDOI = DatasetsTable
            .select {
                (DatasetsTable.datasetId eq datasetUuid) and
                    (DatasetsTable.datasetVersion eq version) and
                    (DatasetsTable.createdBy eq username)
            }
            .singleOrNull()
            ?.get(DatasetsTable.datasetDOI)

        if (datasetDOI != null) {
            throw UnprocessableEntityException("Dataset $datasetId, version $version has a DOI and cannot be deleted")
        }

        DatasetsTable.deleteWhere {
            (DatasetsTable.datasetId eq datasetUuid) and
                (DatasetsTable.datasetVersion eq version) and
                (DatasetsTable.createdBy eq username)
        }
    }

    fun validateCreateDatasetDOI(username: String, datasetId: String, version: Long) {
        log.info { "Validate create DOI for dataset $datasetId, version $version, user $username" }

        if (DatasetsTable
                .select {
                    (DatasetsTable.datasetId eq UUID.fromString(datasetId)) and
                        (DatasetsTable.datasetVersion eq version) and
                        (DatasetsTable.createdBy eq username)
                }
                .empty()
        ) {
            throw NotFoundException("Dataset $datasetId, version $version does not exist")
        }

        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC).toJavaLocalDateTime()
        val sevenDaysAgo = LocalDateTime.parse(now.minusDays(7).toString())
        val count = DatasetsTable
            .select {
                (DatasetsTable.createdBy eq username) and
                    (DatasetsTable.createdAt greaterEq sevenDaysAgo) and
                    (DatasetsTable.datasetDOI neq "")
            }
            .count()
        if (count >= DatasetCitationsConstants.DOI_WEEKLY_RATE_LIMIT) {
            throw UnprocessableEntityException(
                "User exceeded limit of ${DatasetCitationsConstants.DOI_WEEKLY_RATE_LIMIT} DOIs created per week.",
            )
        }
    }

    fun createDatasetDOI(username: String, datasetId: String, version: Long): ResponseDataset {
        log.info { "Create DOI for dataset $datasetId, version $version, user $username" }

        validateCreateDatasetDOI(username, datasetId, version)

        val datasetDOI = "${DatasetCitationsConstants.DOI_PREFIX}/$datasetId.$version"

        DatasetsTable.update(
            {
                (DatasetsTable.datasetId eq UUID.fromString(datasetId)) and
                    (DatasetsTable.datasetVersion eq version) and
                    (DatasetsTable.createdBy eq username)
            },
        ) {
            it[DatasetsTable.datasetDOI] = datasetDOI
        }

        return ResponseDataset(
            datasetId,
            version,
        )
    }

    fun getUserCitedByDataset(accessions: List<SequenceEntryStatus>): CitedBy {
        log.info { "Get user cited by dataset" }
        data class EnrichedDatasetRecord(
            val accession: String,
            val datasetId: UUID,
            val datasetVersion: Long,
            val createdAt: Timestamp,
        )

        val selectedDatasetRecords = DatasetRecordsTable
            .innerJoin(DatasetToRecordsTable)
            .innerJoin(DatasetsTable)
            .select(
                where = {
                    DatasetRecordsTable.accession inList accessions.map { it.accession.plus('.').plus(it.version) }
                },
            )
            .map {
                EnrichedDatasetRecord(
                    it[DatasetRecordsTable.accession],
                    it[DatasetsTable.datasetId],
                    it[DatasetsTable.datasetVersion],
                    Timestamp.valueOf(it[DatasetsTable.createdAt].toJavaLocalDateTime()),
                )
            }

        val datasetMap = mutableMapOf<String, MutableList<Dataset>>()

        for (record in selectedDatasetRecords) {
            val accession = record.accession
            val datasetList = datasetMap.computeIfAbsent(accession) { mutableListOf() }

            val dataset = Dataset(
                record.datasetId,
                record.datasetVersion,
                "",
                record.createdAt,
                "",
                "",
                "",
            )

            if (!datasetList.contains(dataset)) {
                datasetList.add(dataset)
            }
        }
        val uniqueLatestDatasets = datasetMap.values
            .mapNotNull { datasets -> datasets.maxByOrNull { it.datasetVersion } }
            .toSet()

        val citedBy = CitedBy(
            mutableListOf(),
            mutableListOf(),
        )
        for (dataset in uniqueLatestDatasets) {
            val year = dataset.createdAt.toLocalDateTime().year.toLong()
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

    fun getDatasetCitedByPublication(datasetId: String, version: Long): CitedBy {
        // TODO: implement after registering to CrossRef API
        // https://github.com/orgs/loculus-project/projects/3/views/1?pane=issue&itemId=50282833

        log.info { "Get dataset cited by publication for datasetId $datasetId, version $version" }

        val citedBy = CitedBy(
            mutableListOf(),
            mutableListOf(),
        )

        return citedBy
    }

    fun validateDatasetRecords(datasetRecords: List<SubmittedDatasetRecord>) {
        if (datasetRecords.isEmpty()) {
            throw UnprocessableEntityException("Dataset must contain at least one record")
        }

        val uniqueAccessions = datasetRecords.map { it.accession }.toSet()
        if (uniqueAccessions.size != datasetRecords.size) {
            throw UnprocessableEntityException("Dataset must not contain duplicate accessions")
        }

        val accessionsWithoutVersions = datasetRecords.filter { !it.accession.contains('.') }.map { it.accession }
        accessionPreconditionValidator.validateAccessions(
            accessionsWithoutVersions,
            listOf(APPROVED_FOR_RELEASE),
        )
        val accessionsWithVersions = try {
            datasetRecords
                .filter { it.accession.contains('.') }
                .map {
                    val (accession, version) = it.accession.split('.')
                    AccessionVersion(accession, version.toLong())
                }
        } catch (e: NumberFormatException) {
            throw UnprocessableEntityException("Accession versions must be integers")
        }

        accessionPreconditionValidator.validateAccessionVersions(
            accessionsWithVersions,
            listOf(APPROVED_FOR_RELEASE),
        )
    }

    fun validateDatasetName(name: String) {
        if (name.isBlank()) {
            throw UnprocessableEntityException("Dataset name must not be empty")
        }
    }

    fun validateUpdateDatasetHasChanges(
        oldDataset: Dataset,
        oldDatasetRecords: List<DatasetRecord>,
        newDatasetName: String,
        newDatasetRecords: List<SubmittedDatasetRecord>,
        newDatasetDescription: String?,
    ) {
        if (oldDataset.name == newDatasetName &&
            oldDataset.description == newDatasetDescription &&
            oldDatasetRecords.map { it.accession }.toSet() == newDatasetRecords.map { it.accession }.toSet()
        ) {
            throw UnprocessableEntityException("Dataset update must contain at least one change")
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
