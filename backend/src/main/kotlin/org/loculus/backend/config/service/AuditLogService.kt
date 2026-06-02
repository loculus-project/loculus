package org.loculus.backend.config.service

import com.fasterxml.jackson.databind.ObjectMapper
import kotlinx.datetime.LocalDateTime
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.loculus.backend.config.dbtables.ConfigAuditLogTable
import org.loculus.backend.utils.DateProvider
import org.springframework.stereotype.Service

enum class AuditAction(val value: String) {
    ORGANISM_CREATE("organism_create"),
    DOCUMENT_REPLACE("document_replace"),
    OP_APPEND("op_append"),
    PUBLISH("publish"),
    MARK_DEPLOYED("mark_deployed"),
    DISCARD_DRAFT("discard_draft"),
}

enum class AuditScope(val value: String) {
    INSTANCE("instance"),
    ORGANISM("organism"),
}

@Service
class AuditLogService(private val dateProvider: DateProvider, private val objectMapper: ObjectMapper) {

    fun append(
        actor: String,
        scope: AuditScope,
        organismKey: String?,
        action: AuditAction,
        details: Map<String, Any>? = null,
        resultVersion: Long? = null,
    ) {
        val now = dateProvider.getCurrentDateTime()
        transaction {
            ConfigAuditLogTable.insert {
                it[ConfigAuditLogTable.occurredAtColumn] = now
                it[ConfigAuditLogTable.actorColumn] = actor
                it[ConfigAuditLogTable.scopeColumn] = scope.value
                it[ConfigAuditLogTable.organismKeyColumn] = organismKey
                it[ConfigAuditLogTable.actionColumn] = action.value
                it[ConfigAuditLogTable.detailsColumn] = details
                it[ConfigAuditLogTable.resultVersionColumn] = resultVersion
            }
        }
    }

    fun listForOrganism(organismKey: String, limit: Int = 200): List<AuditEntry> = transaction {
        ConfigAuditLogTable.selectAll()
            .where { ConfigAuditLogTable.organismKeyColumn eq organismKey }
            .orderBy(
                ConfigAuditLogTable.occurredAtColumn to SortOrder.DESC,
                ConfigAuditLogTable.idColumn to SortOrder.DESC,
            )
            .limit(limit)
            .map { it.toAuditEntry() }
    }

    fun listInstance(limit: Int = 200): List<AuditEntry> = transaction {
        ConfigAuditLogTable.selectAll()
            .where { ConfigAuditLogTable.scopeColumn eq AuditScope.INSTANCE.value }
            .orderBy(
                ConfigAuditLogTable.occurredAtColumn to SortOrder.DESC,
                ConfigAuditLogTable.idColumn to SortOrder.DESC,
            )
            .limit(limit)
            .map { it.toAuditEntry() }
    }

    fun pendingOrganismOps(organismKey: String): List<AuditEntry> = transaction {
        val resetMarker = ConfigAuditLogTable.selectAll()
            .where { ConfigAuditLogTable.organismKeyColumn eq organismKey }
            .andWhere {
                ConfigAuditLogTable.actionColumn inList
                    listOf(
                        AuditAction.PUBLISH.value,
                        AuditAction.DISCARD_DRAFT.value,
                        AuditAction.ORGANISM_CREATE.value,
                    )
            }
            .orderBy(
                ConfigAuditLogTable.occurredAtColumn to SortOrder.DESC,
                ConfigAuditLogTable.idColumn to SortOrder.DESC,
            )
            .limit(1)
            .map { it[ConfigAuditLogTable.occurredAtColumn] }
            .singleOrNull()

        val baseQuery = ConfigAuditLogTable.selectAll()
            .where { ConfigAuditLogTable.organismKeyColumn eq organismKey }
            .andWhere { ConfigAuditLogTable.actionColumn eq AuditAction.OP_APPEND.value }

        val filteredQuery = if (resetMarker != null) {
            baseQuery.andWhere { ConfigAuditLogTable.occurredAtColumn greater resetMarker }
        } else {
            baseQuery
        }

        filteredQuery.orderBy(
            ConfigAuditLogTable.occurredAtColumn to SortOrder.ASC,
            ConfigAuditLogTable.idColumn to SortOrder.ASC,
        )
            .map { it.toAuditEntry() }
    }

    private fun org.jetbrains.exposed.sql.ResultRow.toAuditEntry() = AuditEntry(
        id = this[ConfigAuditLogTable.idColumn],
        occurredAt = this[ConfigAuditLogTable.occurredAtColumn],
        actor = this[ConfigAuditLogTable.actorColumn],
        scope = this[ConfigAuditLogTable.scopeColumn],
        organismKey = this[ConfigAuditLogTable.organismKeyColumn],
        action = this[ConfigAuditLogTable.actionColumn],
        details = this[ConfigAuditLogTable.detailsColumn],
        resultVersion = this[ConfigAuditLogTable.resultVersionColumn],
    )

    data class AuditEntry(
        val id: Long,
        val occurredAt: LocalDateTime,
        val actor: String,
        val scope: String,
        val organismKey: String?,
        val action: String,
        val details: Map<String, Any>?,
        val resultVersion: Long?,
    )
}
