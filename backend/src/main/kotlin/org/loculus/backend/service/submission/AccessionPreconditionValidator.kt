package org.loculus.backend.service.submission

import org.jetbrains.exposed.sql.Query
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.not
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
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class AccessionPreconditionValidator(
    private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
) {
    /**
     * Usage:
     *
     * ```
     * AccessionPreconditionValidator.validate {
     *     that... // let the IDE guide you
     * }
     * ```
     */
    @Transactional(readOnly = true)
    fun validate(validations: PreconditionsEntrypoint.() -> Unit) {
        validations(PreconditionsEntrypoint(groupManagementPreconditionValidator))
    }

    class PreconditionsEntrypoint(
        private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
    ) {
        fun thatAccessionVersionsExist(accessionVersions: List<AccessionVersionInterface>): CommonPreconditions =
            AccessionVersionPreconditions(accessionVersions, groupManagementPreconditionValidator)
                .validateAccessionVersionsExist()

        fun thatAccessionVersionExists(accessionVersion: AccessionVersionInterface): CommonPreconditions =
            AccessionVersionPreconditions(listOf(accessionVersion), groupManagementPreconditionValidator)
                .validateAccessionVersionsExist()

        fun thatAccessionsExist(accessions: List<Accession>): CommonPreconditions = AccessionPreconditions(
            accessions = accessions,
            groupManagementPreconditionValidator = groupManagementPreconditionValidator,
        )
            .validateAccessionsExist()
    }

    class AccessionVersionPreconditions(
        private val accessionVersions: List<AccessionVersionInterface>,
        groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
    ) : CommonPreconditions(
        sequenceEntries = SequenceEntriesView
            .select(
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.submitterColumn,
                SequenceEntriesView.groupIdColumn,
                SequenceEntriesView.statusColumn,
                SequenceEntriesView.organismColumn,
                SequenceEntriesView.errorsColumn,
            )
            .where { SequenceEntriesView.accessionVersionIsIn(accessionVersions) },
        groupManagementPreconditionValidator = groupManagementPreconditionValidator,
    ) {
        fun validateAccessionVersionsExist(): AccessionVersionPreconditions {
            if (sequenceEntries.count() == accessionVersions.size.toLong()) {
                return this
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
    }

    class AccessionPreconditions(
        private val accessions: List<Accession>,
        groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
    ) : CommonPreconditions(
        sequenceEntries = SequenceEntriesView
            .select(
                SequenceEntriesView.accessionColumn,
                SequenceEntriesView.versionColumn,
                SequenceEntriesView.submitterColumn,
                SequenceEntriesView.groupIdColumn,
                SequenceEntriesView.statusColumn,
                SequenceEntriesView.organismColumn,
                SequenceEntriesView.errorsColumn,
            )
            .where {
                (SequenceEntriesView.accessionColumn inList accessions) and SequenceEntriesView.isMaxVersion
            },
        groupManagementPreconditionValidator = groupManagementPreconditionValidator,
    ) {
        fun validateAccessionsExist(): AccessionPreconditions {
            if (sequenceEntries.count() == accessions.size.toLong()) {
                return this
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
    }

    abstract class CommonPreconditions(
        protected val sequenceEntries: Query,
        private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
    ) {
        fun andThatSequenceEntriesAreProcessed(): CommonPreconditions {
            val unprocessedSequenceEntries = sequenceEntries
                .filter { row -> row[SequenceEntriesView.statusColumn] == Status.PROCESSED.name }
                .size

            if (unprocessedSequenceEntries > 0) {
                throw UnprocessableEntityException(
                    "$unprocessedSequenceEntries are not in PROCESSED status.",
                )
            }
            return this
        }

        fun andThatSequenceEntriesAreInStates(statuses: List<Status>): CommonPreconditions {
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
            return this
        }

        fun andThatSequenceEntriesHaveNoErrors(): CommonPreconditions {
            val sequenceEntriesWithErrors = sequenceEntries
                .filter { row -> row[SequenceEntriesView.errorsColumn].orEmpty().isNotEmpty() }
                .size

            if (sequenceEntriesWithErrors > 0) {
                throw UnprocessableEntityException(
                    "$sequenceEntriesWithErrors sequences have errors.",
                )
            }
            return this
        }

        fun andThatUserIsAllowedToEditSequenceEntries(authenticatedUser: AuthenticatedUser): CommonPreconditions {
            if (authenticatedUser.isSuperUser) {
                return this
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
            return this
        }

        fun andThatOrganismIs(organism: Organism): CommonPreconditions {
            val accessionVersionsByOtherOrganisms =
                sequenceEntries.filter { it[SequenceEntriesView.organismColumn] != organism.name }
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
                return this
            }

            val accessionVersionsOfOtherOrganism = accessionVersionsByOtherOrganisms
                .map { (organism, accessionVersions) ->
                    val accessionVersionsString = accessionVersions.sortedWith(AccessionVersionComparator)
                        .joinToString(", ") { it.displayAccessionVersion() }
                    "organism $organism: $accessionVersionsString"
                }
                .joinToString(" - ")
            throw UnprocessableEntityException(
                "The following accession versions are not of organism ${organism.name}: " +
                    accessionVersionsOfOtherOrganism,
            )
        }
    }
}
