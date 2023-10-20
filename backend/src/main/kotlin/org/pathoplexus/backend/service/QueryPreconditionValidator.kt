package org.pathoplexus.backend.service

import org.jetbrains.exposed.sql.Query
import org.jetbrains.exposed.sql.select
import org.pathoplexus.backend.controller.ForbiddenException
import org.pathoplexus.backend.controller.UnprocessableEntityException
import org.pathoplexus.backend.service.Status.SILO_READY
import org.springframework.stereotype.Component

@Component
class QueryPreconditionValidator {

    fun validate(submitter: String, sequenceVersions: List<SequenceVersion>, status: Status) {
        val sequences = SequencesTable
            .slice(SequencesTable.sequenceId, SequencesTable.version, SequencesTable.submitter, SequencesTable.status)
            .select(
                where = {
                    Pair(SequencesTable.sequenceId, SequencesTable.version) inList sequenceVersions.toPairs()
                },
            )

        validateSequenceVersionsExist(sequences, sequenceVersions)
        validateSequencesAreInState(sequences, status)
        validateUserIsAllowedToEditSequences(sequences, submitter)
    }

    fun validateRevokePreconditions(submitter: String, sequenceIds: List<Long>) {
        val sequences = SequencesTable
            .slice(SequencesTable.sequenceId, SequencesTable.version, SequencesTable.submitter, SequencesTable.status)
            .select(
                where = {
                    SequencesTable.sequenceId inList sequenceIds
                },
            )

        validateSequenceIdExist(sequences, sequenceIds)
        validateSequencesAreInState(sequences, SILO_READY)
        validateUserIsAllowedToEditSequences(sequences, submitter)
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

    private fun validateSequencesAreInState(sequences: Query, status: Status) {
        val sequencesNotProcessed = sequences
            .filter { it[SequencesTable.status] != status.name }
            .map { "${it[SequencesTable.sequenceId]}.${it[SequencesTable.version]} - ${it[SequencesTable.status]}" }

        if (sequencesNotProcessed.isNotEmpty()) {
            throw UnprocessableEntityException(
                "Sequence versions are in not in state $status: " +
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

    private fun validateSequenceIdExist(sequences: Query, sequenceIds: List<Long>) {
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
