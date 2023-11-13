package org.pathoplexus.backend.service

import org.jetbrains.exposed.sql.Query
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.select
import org.pathoplexus.backend.api.AccessionVersion
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.api.toPairs
import org.pathoplexus.backend.controller.ForbiddenException
import org.pathoplexus.backend.controller.UnprocessableEntityException
import org.springframework.stereotype.Component

@Component
class QueryPreconditionValidator {

    fun validateAccessionVersions(
        submitter: String,
        accessionVersions: List<AccessionVersion>,
        statuses: List<Status>,
    ) {
        val sequenceEntries = SequenceEntriesTable
            .slice(
                SequenceEntriesTable.accession,
                SequenceEntriesTable.version,
                SequenceEntriesTable.submitter,
                SequenceEntriesTable.status,
            )
            .select(
                where = {
                    Pair(
                        SequenceEntriesTable.accession,
                        SequenceEntriesTable.version,
                    ) inList accessionVersions.toPairs()
                },
            )

        validateAccessionVersionsExist(sequenceEntries, accessionVersions)
        validateSequenceEntriesAreInStates(sequenceEntries, statuses)
        validateUserIsAllowedToEditSequenceEntries(sequenceEntries, submitter)
    }

    fun validateAccessions(
        submitter: String,
        accessions: List<Accession>,
        statuses: List<Status>,
    ): List<AccessionVersion> {
        val maxVersionQuery = maxVersionQuery()

        val sequenceEntries = SequenceEntriesTable
            .slice(
                SequenceEntriesTable.accession,
                SequenceEntriesTable.version,
                SequenceEntriesTable.submitter,
                SequenceEntriesTable.status,
            )
            .select(
                where = {
                    (SequenceEntriesTable.accession inList accessions)
                        .and((SequenceEntriesTable.version eq maxVersionQuery))
                },
            )

        validateAccessionsExist(sequenceEntries, accessions)
        validateSequenceEntriesAreInStates(sequenceEntries, statuses)
        validateUserIsAllowedToEditSequenceEntries(sequenceEntries, submitter)

        return sequenceEntries.map {
            AccessionVersion(
                it[SequenceEntriesTable.accession],
                it[SequenceEntriesTable.version],
            )
        }
    }

    private fun validateAccessionVersionsExist(sequenceEntries: Query, accessionVersions: List<AccessionVersion>) {
        if (sequenceEntries.count() == accessionVersions.size.toLong()) {
            return
        }

        val accessionVersionsNotFound = accessionVersions
            .filter { accessionVersion ->
                sequenceEntries.none {
                    it[SequenceEntriesTable.accession] == accessionVersion.accession &&
                        it[SequenceEntriesTable.version] == accessionVersion.version
                }
            }
            .sortedWith(AccessionVersionComparator)
            .joinToString(", ") { it.displayAccessionVersion() }

        throw UnprocessableEntityException("Accession versions $accessionVersionsNotFound do not exist")
    }

    private fun validateSequenceEntriesAreInStates(sequenceEntries: Query, statuses: List<Status>) {
        val sequenceEntriesNotInStatuses = sequenceEntries
            .filter {
                statuses.none { status -> it[SequenceEntriesTable.status] == status.name }
            }
            .sortedWith { left, right ->
                AccessionComparator.compare(
                    left[SequenceEntriesTable.accession],
                    right[SequenceEntriesTable.accession],
                )
            }
            .map {
                "${it[SequenceEntriesTable.accession]}.${it[SequenceEntriesTable.version]} - " +
                    it[SequenceEntriesTable.status]
            }

        if (sequenceEntriesNotInStatuses.isNotEmpty()) {
            throw UnprocessableEntityException(
                "Accession versions are in not in one of the states $statuses: " +
                    sequenceEntriesNotInStatuses.joinToString(", "),
            )
        }
    }

    private fun validateUserIsAllowedToEditSequenceEntries(sequenceEntries: Query, submitter: String) {
        val sequenceEntriesNotSubmittedByUser = sequenceEntries
            .filter { it[SequenceEntriesTable.submitter] != submitter }
            .map { AccessionVersion(it[SequenceEntriesTable.accession], it[SequenceEntriesTable.version]) }

        if (sequenceEntriesNotSubmittedByUser.isNotEmpty()) {
            val accessionVersionString = sequenceEntriesNotSubmittedByUser.sortedWith(AccessionVersionComparator)
                .joinToString(", ") { it.displayAccessionVersion() }

            throw ForbiddenException(
                "User '$submitter' does not have right to change the accession versions $accessionVersionString",
            )
        }
    }

    private fun validateAccessionsExist(sequenceEntries: Query, accessions: List<Accession>) {
        if (sequenceEntries.count() == accessions.size.toLong()) {
            return
        }

        val accessionsNotFound = accessions
            .filter { accession ->
                sequenceEntries.none {
                    it[SequenceEntriesTable.accession] == accession
                }
            }
            .sortedWith(AccessionComparator)
            .joinToString(", ")

        throw UnprocessableEntityException("Accessions $accessionsNotFound do not exist")
    }
}
