package org.pathoplexus.backend.service

import org.jetbrains.exposed.sql.Query
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.select
import org.pathoplexus.backend.api.SequenceVersion
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.api.toPairs
import org.pathoplexus.backend.controller.ForbiddenException
import org.pathoplexus.backend.controller.UnprocessableEntityException
import org.springframework.stereotype.Component

@Component
class QueryPreconditionValidator {

    fun validateSequenceVersions(submitter: String, sequenceVersions: List<SequenceVersion>, statuses: List<Status>) {
        val sequences = SequencesTable
            .slice(SequencesTable.sequenceId, SequencesTable.version, SequencesTable.submitter, SequencesTable.status)
            .select(
                where = {
                    Pair(SequencesTable.sequenceId, SequencesTable.version) inList sequenceVersions.toPairs()
                },
            )

        validateSequenceVersionsExist(sequences, sequenceVersions)
        validateSequencesAreInStates(sequences, statuses)
        validateUserIsAllowedToEditSequences(sequences, submitter)
    }

    fun validateSequenceIds(submitter: String, sequenceIds: List<Long>, statuses: List<Status>): List<SequenceVersion> {
        val maxVersionQuery = maxVersionQuery()

        val sequences = SequencesTable
            .slice(SequencesTable.sequenceId, SequencesTable.version, SequencesTable.submitter, SequencesTable.status)
            .select(
                where = {
                    (SequencesTable.sequenceId inList sequenceIds)
                        .and((SequencesTable.version eq maxVersionQuery))
                },
            )

        validateSequenceIdsExist(sequences, sequenceIds)
        validateSequencesAreInStates(sequences, statuses)
        validateUserIsAllowedToEditSequences(sequences, submitter)

        return sequences.map {
            SequenceVersion(
                it[SequencesTable.sequenceId],
                it[SequencesTable.version],
            )
        }
    }

    private fun validateSequenceVersionsExist(sequences: Query, sequenceVersions: List<SequenceVersion>) {
        if (sequences.count() == sequenceVersions.size.toLong()) {
            return
        }

        val sequenceVersionsNotFound = sequenceVersions
            .filter { sequenceVersion ->
                sequences.none {
                    it[SequencesTable.sequenceId] == sequenceVersion.sequenceId &&
                        it[SequencesTable.version] == sequenceVersion.version
                }
            }.joinToString(", ") { it.displaySequenceVersion() }

        throw UnprocessableEntityException("Sequence versions $sequenceVersionsNotFound do not exist")
    }

    private fun validateSequencesAreInStates(sequences: Query, statuses: List<Status>) {
        val sequencesNotProcessed = sequences
            .filter {
                statuses.none { status -> it[SequencesTable.status] == status.name }
            }
            .map { "${it[SequencesTable.sequenceId]}.${it[SequencesTable.version]} - ${it[SequencesTable.status]}" }

        if (sequencesNotProcessed.isNotEmpty()) {
            throw UnprocessableEntityException(
                "Sequence versions are in not in one of the states $statuses: " +
                    sequencesNotProcessed.joinToString(", "),
            )
        }
    }

    private fun validateUserIsAllowedToEditSequences(sequences: Query, submitter: String) {
        val sequencesNotSubmittedByUser = sequences.filter { it[SequencesTable.submitter] != submitter }
            .map { SequenceVersion(it[SequencesTable.sequenceId], it[SequencesTable.version]) }

        if (sequencesNotSubmittedByUser.isNotEmpty()) {
            throw ForbiddenException(
                "User '$submitter' does not have right to change the sequence versions " +
                    sequencesNotSubmittedByUser.joinToString(", ") { it.displaySequenceVersion() },
            )
        }
    }

    private fun validateSequenceIdsExist(sequences: Query, sequenceIds: List<Long>) {
        if (sequences.count() == sequenceIds.size.toLong()) {
            return
        }

        val sequenceVersionsNotFound = sequenceIds
            .filter { sequenceId ->
                sequences.none {
                    it[SequencesTable.sequenceId] == sequenceId
                }
            }.joinToString(", ") { it.toString() }

        throw UnprocessableEntityException("SequenceIds $sequenceVersionsNotFound do not exist")
    }
}
