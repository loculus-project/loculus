package org.loculus.backend.service.submission

import org.jetbrains.exposed.sql.Query
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.select
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.Organism
import org.loculus.backend.api.Status
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.controller.ForbiddenException
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.service.groupmanagement.GroupManagementPreconditionValidator
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.AccessionComparator
import org.loculus.backend.utils.AccessionVersionComparator
import org.loculus.backend.utils.Version
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class AccessionPreconditionValidator(
    private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
) {
    @Transactional(readOnly = true)
    fun validateAccessionVersions(
        authenticatedUser: AuthenticatedUser,
        accessionVersions: List<AccessionVersionInterface>,
        statuses: List<Status>,
        organism: Organism,
    ) {
        val sequenceEntries = SequenceEntriesView
            .slice(
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.submitterColumn,
                SequenceEntriesView.groupIdColumn,
                SequenceEntriesView.statusColumn,
                SequenceEntriesView.organismColumn,
            )
            .select(where = { SequenceEntriesView.accessionVersionIsIn(accessionVersions) })

        validateAccessionVersionsExist(sequenceEntries, accessionVersions)
        validateSequenceEntriesAreInStates(sequenceEntries, statuses)
        validateUserIsAllowedToEditSequenceEntries(sequenceEntries, authenticatedUser)
        validateOrganism(sequenceEntries, organism)
    }

    @Transactional(readOnly = true)
    fun validateAccessionVersions(accessionVersions: List<AccessionVersionInterface>, statuses: List<Status>) {
        val sequenceEntries = SequenceEntriesView
            .slice(
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.statusColumn,
            )
            .select(where = { SequenceEntriesView.accessionVersionIsIn(accessionVersions) })

        validateAccessionVersionsExist(sequenceEntries, accessionVersions)
        validateSequenceEntriesAreInStates(sequenceEntries, statuses)
    }

    @Transactional(readOnly = true)
    fun validateAccessions(
        authenticatedUser: AuthenticatedUser,
        accessions: List<Accession>,
        statuses: List<Status>,
        organism: Organism,
    ) {
        val sequenceEntries = SequenceEntriesView
            .slice(
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.submitterColumn,
                SequenceEntriesView.groupIdColumn,
                SequenceEntriesView.statusColumn,
                SequenceEntriesView.organismColumn,
            )
            .select(
                where = {
                    (SequenceEntriesView.accessionColumn inList accessions) and SequenceEntriesView.isMaxVersion
                },
            )

        validateAccessionsExist(sequenceEntries, accessions)
        validateSequenceEntriesAreInStates(sequenceEntries, statuses)
        validateUserIsAllowedToEditSequenceEntries(sequenceEntries, authenticatedUser)
        validateOrganism(sequenceEntries, organism)
    }

    @Transactional(readOnly = true)
    fun validateAccessions(authenticatedUser: AuthenticatedUser, accessions: List<Accession>) {
        val sequenceEntries = SequenceEntriesView
            .slice(
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.submitterColumn,
                SequenceEntriesView.groupIdColumn,
            )
            .select(
                where = {
                    (SequenceEntriesView.accessionColumn inList accessions) and SequenceEntriesView.isMaxVersion
                },
            )

        validateAccessionsExist(sequenceEntries, accessions)
        validateUserIsAllowedToEditSequenceEntries(sequenceEntries, authenticatedUser)
    }

    @Transactional(readOnly = true)
    fun validateAccessions(accessions: List<Accession>, statuses: List<Status>): List<AccessionVersionGroup> {
        val sequenceEntries = SequenceEntriesView
            .slice(
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.statusColumn,
                SequenceEntriesView.groupIdColumn,
            )
            .select(
                where = {
                    (SequenceEntriesView.accessionColumn inList accessions) and SequenceEntriesView.isMaxVersion
                },
            )

        validateAccessionsExist(sequenceEntries, accessions)
        validateSequenceEntriesAreInStates(sequenceEntries, statuses)

        return sequenceEntries.map {
            AccessionVersionGroup(
                it[SequenceEntriesView.accessionColumn],
                it[SequenceEntriesView.versionColumn],
                it[SequenceEntriesView.groupIdColumn],
            )
        }
    }

    private fun validateAccessionVersionsExist(
        sequenceEntries: Query,
        accessionVersions: List<AccessionVersionInterface>,
    ) {
        if (sequenceEntries.count() == accessionVersions.size.toLong()) {
            return
        }

        val accessionVersionsNotFound = accessionVersions
            .filter { accessionVersion ->
                sequenceEntries.none {
                    it[SequenceEntriesView.accessionColumn] == accessionVersion.accession &&
                        it[SequenceEntriesView.versionColumn] == accessionVersion.version
                }
            }
            .sortedWith(AccessionVersionComparator)
            .joinToString(", ") { it.displayAccessionVersion() }

        throw UnprocessableEntityException("Accession versions $accessionVersionsNotFound do not exist")
    }

    private fun validateSequenceEntriesAreInStates(sequenceEntries: Query, statuses: List<Status>) {
        val sequenceEntriesNotInStatuses = sequenceEntries
            .filter {
                statuses.none { status -> it[SequenceEntriesView.statusColumn] == status.name }
            }
            .sortedWith { left, right ->
                AccessionComparator.compare(
                    left[SequenceEntriesView.accessionColumn],
                    right[SequenceEntriesView.accessionColumn],
                )
            }
            .map {
                "${it[SequenceEntriesView.accessionColumn]}.${it[SequenceEntriesView.versionColumn]} - " +
                    it[SequenceEntriesView.statusColumn]
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
        authenticatedUser: AuthenticatedUser,
    ) {
        if (authenticatedUser.isSuperUser) {
            return
        }

        val groupsOfSequenceEntries = sequenceEntries
            .groupBy(
                {
                    it[SequenceEntriesView.groupIdColumn]
                },
                {
                    AccessionVersion(it[SequenceEntriesView.accessionColumn], it[SequenceEntriesView.versionColumn])
                },
            )

        groupsOfSequenceEntries.forEach { (groupId, accessionList) ->
            try {
                groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroup(groupId, authenticatedUser)
            } catch (error: ForbiddenException) {
                throw ForbiddenException(
                    error.message + " Affected AccessionVersions: " + accessionList.map {
                        it.displayAccessionVersion()
                    },
                )
            }
        }
    }

    private fun validateAccessionsExist(sequenceEntries: Query, accessions: List<Accession>) {
        if (sequenceEntries.count() == accessions.size.toLong()) {
            return
        }

        val accessionsNotFound = accessions
            .filter { accession ->
                sequenceEntries.none {
                    it[SequenceEntriesView.accessionColumn] == accession
                }
            }
            .sortedWith(AccessionComparator)
            .joinToString(", ")

        throw UnprocessableEntityException("Accessions $accessionsNotFound do not exist")
    }

    private fun validateOrganism(sequenceEntryVersions: Query, organism: Organism) {
        val accessionVersionsByOtherOrganisms =
            sequenceEntryVersions.filter { it[SequenceEntriesView.organismColumn] != organism.name }
                .groupBy(
                    { it[SequenceEntriesView.organismColumn] },
                    {
                        AccessionVersion(
                            it[SequenceEntriesView.accessionColumn],
                            it[SequenceEntriesView.versionColumn],
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
        val groupId: Int,
    ) : AccessionVersionInterface
}
