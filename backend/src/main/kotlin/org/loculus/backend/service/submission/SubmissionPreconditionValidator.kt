package org.loculus.backend.service.submission

import org.jetbrains.exposed.sql.Query
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.select
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.Organism
import org.loculus.backend.api.Status
import org.loculus.backend.controller.ForbiddenException
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.service.groupmanagement.GroupManagementPreconditionValidator
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.AccessionComparator
import org.loculus.backend.utils.AccessionVersionComparator
import org.loculus.backend.utils.Version
import org.springframework.stereotype.Component

@Component
class SubmissionPreconditionValidator(
    private val sequenceEntriesTableProvider: SequenceEntriesTableProvider,
    private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
) {

    fun validateAccessionVersions(
        submitter: String,
        accessionVersions: List<AccessionVersionInterface>,
        statuses: List<Status>,
        organism: Organism,
    ) {
        sequenceEntriesTableProvider.get(organism).let { table ->
            val sequenceEntries = table
                .slice(
                    table.accessionColumn,
                    table.versionColumn,
                    table.submitterColumn,
                    table.groupNameColumn,
                    table.statusColumn,
                    table.organismColumn,
                )
                .select(where = { table.accessionVersionIsIn(accessionVersions) })

            validateAccessionVersionsExist(sequenceEntries, accessionVersions, table)
            validateSequenceEntriesHaveSpecifiedStatuses(sequenceEntries, statuses, table)
            validateUserIsAllowedToEditSequenceEntries(sequenceEntries, submitter, table)
            validateOrganism(sequenceEntries, organism, table)
        }
    }

    /**
     * This function fetches entries with the `accessions` from the database and validates that
     *
     * - all `accessions` exist
     * - the entries have one of the specified `statuses`
     * - the `submitter` is authorized to edit the entries
     * - the entries belong to the specified `organism`
     */
    fun validateAccessions(
        submitter: String,
        accessions: List<Accession>,
        statuses: List<Status>,
        organism: Organism,
    ): List<AccessionVersionGroup> {
        sequenceEntriesTableProvider.get(organism).let { table ->
            val sequenceEntries = table
                .slice(
                    table.accessionColumn,
                    table.versionColumn,
                    table.submitterColumn,
                    table.groupNameColumn,
                    table.statusColumn,
                    table.organismColumn,
                )
                .select(
                    where = { (table.accessionColumn inList accessions) and table.isMaxVersion },
                )

            validateAccessionsExist(sequenceEntries, accessions, table)
            validateSequenceEntriesHaveSpecifiedStatuses(sequenceEntries, statuses, table)
            validateUserIsAllowedToEditSequenceEntries(sequenceEntries, submitter, table)
            validateOrganism(sequenceEntries, organism, table)

            return sequenceEntries.map {
                AccessionVersionGroup(
                    it[table.accessionColumn],
                    it[table.versionColumn],
                    it[table.groupNameColumn],
                )
            }
        }
    }

    private fun validateAccessionVersionsExist(
        sequenceEntries: Query,
        accessionVersions: List<AccessionVersionInterface>,
        table: SequenceEntriesDataTable,
    ) {
        if (sequenceEntries.count() == accessionVersions.size.toLong()) {
            return
        }

        val accessionVersionsNotFound = accessionVersions
            .filter { accessionVersion ->
                sequenceEntries.none {
                    it[table.accessionColumn] == accessionVersion.accession &&
                        it[table.versionColumn] == accessionVersion.version
                }
            }
            .sortedWith(AccessionVersionComparator)
            .joinToString(", ") { it.displayAccessionVersion() }

        throw UnprocessableEntityException("Accession versions $accessionVersionsNotFound do not exist")
    }

    /**
     * Validates that the given sequence entries have one of the specified statuses.
     *
     * @throws UnprocessableEntityException If any of the sequence entries does not have one of the specified statuses.
     */
    private fun validateSequenceEntriesHaveSpecifiedStatuses(
        sequenceEntries: Query,
        statuses: List<Status>,
        table: SequenceEntriesDataTable,
    ) {
        val sequenceEntriesNotInStatuses = sequenceEntries
            .filter {
                statuses.none { status -> it[table.statusColumn] == status.name }
            }
            .sortedWith { left, right ->
                AccessionComparator.compare(
                    left[table.accessionColumn],
                    right[table.accessionColumn],
                )
            }
            .map {
                "${it[table.accessionColumn]}.${it[table.versionColumn]} - " +
                    it[table.statusColumn]
            }

        if (sequenceEntriesNotInStatuses.isNotEmpty()) {
            throw UnprocessableEntityException(
                "Accession versions are in not in one of the states $statuses: " +
                    sequenceEntriesNotInStatuses.joinToString(", "),
            )
        }
    }

    private fun validateUserIsAllowedToEditSequenceEntries(
        sequenceEntries: Query,
        submitter: String,
        table: SequenceEntriesDataTable,
    ) {
        val groupsOfSequenceEntries = sequenceEntries
            .groupBy({
                it[table.groupNameColumn]
            }, {
                AccessionVersion(it[table.accessionColumn], it[table.versionColumn])
            })

        groupsOfSequenceEntries.forEach { (groupName, accessionList) ->
            try {
                groupManagementPreconditionValidator.validateUserInExistingGroupAndReturnUserList(groupName, submitter)
            } catch (error: ForbiddenException) {
                throw ForbiddenException(
                    error.message + " Affected AccessionVersions: " + accessionList.map {
                        it.displayAccessionVersion()
                    },
                )
            }
        }
    }

    private fun validateAccessionsExist(
        sequenceEntries: Query,
        accessions: List<Accession>,
        table: SequenceEntriesDataTable,
    ) {
        if (sequenceEntries.count() == accessions.size.toLong()) {
            return
        }

        val accessionsNotFound = accessions
            .filter { accession ->
                sequenceEntries.none {
                    it[table.accessionColumn] == accession
                }
            }
            .sortedWith(AccessionComparator)
            .joinToString(", ")

        throw UnprocessableEntityException("Accessions $accessionsNotFound do not exist")
    }

    private fun validateOrganism(sequenceEntryVersions: Query, organism: Organism, table: SequenceEntriesDataTable) {
        val accessionVersionsByOtherOrganisms =
            sequenceEntryVersions.filter { it[table.organismColumn] != organism.name }
                .groupBy(
                    { it[table.organismColumn] },
                    {
                        AccessionVersion(
                            it[table.accessionColumn],
                            it[table.versionColumn],
                        )
                    },
                )

        if (accessionVersionsByOtherOrganisms.isEmpty()) {
            return
        }

        val accessionVersionsOfOtherOrganism = accessionVersionsByOtherOrganisms
            .map { (organism, accessionVersions) ->
                val accessionVersionsString = accessionVersions.sortedWith(AccessionVersionComparator)
                    .joinToString(", ") { it.displayAccessionVersion() }
                "organism $organism: $accessionVersionsString"
            }
            .joinToString(" - ")
        throw UnprocessableEntityException(
            "The following accession versions are not of organism ${organism.name}: $accessionVersionsOfOtherOrganism",
        )
    }

    data class AccessionVersionGroup(
        override val accession: Accession,
        override val version: Version,
        val groupName: String,
    ) : AccessionVersionInterface
}
