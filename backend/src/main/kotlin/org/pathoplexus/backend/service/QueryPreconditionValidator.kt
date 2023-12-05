package org.pathoplexus.backend.service

import org.jetbrains.exposed.sql.Query
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.select
import org.pathoplexus.backend.api.AccessionVersion
import org.pathoplexus.backend.api.Organism
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.controller.ForbiddenException
import org.pathoplexus.backend.controller.UnprocessableEntityException
import org.pathoplexus.backend.utils.Accession
import org.pathoplexus.backend.utils.AccessionComparator
import org.pathoplexus.backend.utils.AccessionVersionComparator
import org.springframework.stereotype.Component

@Component
class QueryPreconditionValidator(
    private val sequenceEntriesTableProvider: SequenceEntriesTableProvider,
) {
    fun validateAccessionVersions(
        submitter: String,
        accessionVersions: List<AccessionVersion>,
        statuses: List<Status>,
        organism: Organism,
    ) {
        sequenceEntriesTableProvider.get(organism).let { table ->val sequenceEntries =
            table
                .slice(
                    table.accessionColumn,
                    table.versionColumn,
                    table.submitterColumn,
                    table.statusColumn,
                    table.organismColumn,
                )
                .select(where = { table.accessionVersionIsIn(accessionVersions) })

            validateAccessionVersionsExist(sequenceEntries, accessionVersions, table)
            validateSequenceEntriesAreInStates(sequenceEntries, statuses, table)
            validateUserIsAllowedToEditSequenceEntries(sequenceEntries, submitter, table)
            validateOrganism(sequenceEntries, organism, table)
        }
    }

    fun validateAccessions(
        submitter: String,
        accessions: List<Accession>,
        statuses: List<Status>,
        organism: Organism,
    ): List<AccessionVersion> {
        sequenceEntriesTableProvider.get(organism).let { table ->val sequenceEntries =
            table
                .slice(
                    table.accessionColumn,
                    table.versionColumn,
                    table.submitterColumn,
                    table.statusColumn,
                    table.organismColumn,
                )
                .select(
                    where = { (table.accessionColumn inList accessions) and table.isMaxVersion },
                )

            validateAccessionsExist(sequenceEntries, accessions, table)
            validateSequenceEntriesAreInStates(sequenceEntries, statuses, table)
            validateUserIsAllowedToEditSequenceEntries(sequenceEntries, submitter, table)
            validateOrganism(sequenceEntries, organism, table)

            return sequenceEntries.map {
                AccessionVersion(
                    it[table.accessionColumn],
                    it[table.versionColumn],
                )
            }
        }
    }

    private fun validateAccessionVersionsExist(
        sequenceEntries: Query,
        accessionVersions: List<AccessionVersion>,
        table: SequenceEntriesDataTable,
    ) {
        if (sequenceEntries.count() == accessionVersions.size.toLong()) {
            return
        }

        val accessionVersionsNotFound =
            accessionVersions
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

    private fun validateSequenceEntriesAreInStates(
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
        val sequenceEntriesNotSubmittedByUser = sequenceEntries
            .filter { it[table.submitterColumn] != submitter }
            .map { AccessionVersion(it[table.accessionColumn], it[table.versionColumn]) }

        if (sequenceEntriesNotSubmittedByUser.isNotEmpty()) {
            val accessionVersionString =
                sequenceEntriesNotSubmittedByUser.sortedWith(AccessionVersionComparator)
                    .joinToString(", ") { it.displayAccessionVersion() }

            throw ForbiddenException(
                "User '$submitter' does not have right to change the accession versions $accessionVersionString",
            )
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

        val accessionsNotFound =
            accessions
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

        val accessionVersionsOfOtherOrganism =
            accessionVersionsByOtherOrganisms
                .map { (organism, accessionVersions) ->
                    val accessionVersionsString =
                        accessionVersions.sortedWith(AccessionVersionComparator)
                            .joinToString(", ") { it.displayAccessionVersion() }
                    "organism $organism: $accessionVersionsString"
                }
                .joinToString(" - ")
        throw UnprocessableEntityException(
            "The following accession versions are not of organism ${organism.name}: $accessionVersionsOfOtherOrganism",
        )
    }
}
