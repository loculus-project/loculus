package org.loculus.backend.config.service

import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.loculus.backend.config.InstanceConfig
import org.loculus.backend.config.OrganismConfig
import org.loculus.backend.config.dbtables.ConfigInstanceDraftTable
import org.loculus.backend.config.dbtables.ConfigInstanceStateTable
import org.loculus.backend.config.dbtables.ConfigInstanceVersionsTable
import org.loculus.backend.config.dbtables.ConfigOrganismDraftsTable
import org.loculus.backend.config.dbtables.ConfigOrganismVersionsTable
import org.loculus.backend.config.dbtables.ConfigOrganismsTable
import org.loculus.backend.config.operations.AppliedBatch
import org.loculus.backend.config.operations.ConfigDocument
import org.loculus.backend.config.operations.OperationDispatcher
import org.loculus.backend.config.operations.OperationRequest
import org.loculus.backend.utils.DateProvider
import org.springframework.stereotype.Service

@Service
class DraftService(
    private val configService: ConfigService,
    private val auditLogService: AuditLogService,
    private val operationDispatcher: OperationDispatcher,
    private val dateProvider: DateProvider,
) {
    fun getOrganismDraft(key: String): OrganismDraftView? = transaction {
        readOrganismDraft(key)
    }

    fun putOrganismDraft(key: String, newConfig: OrganismConfig, ifMatch: Long?, actor: String): Long {
        val now = dateProvider.getCurrentDateTime()
        return transaction {
            val orgRow = ConfigOrganismsTable.selectAll()
                .where { ConfigOrganismsTable.keyColumn eq key }
                .singleOrNull() ?: throw OrganismNotFoundException(key)
            val status = orgRow[ConfigOrganismsTable.statusColumn]
            if (status != "unreleased") {
                throw DraftScopeMismatchException(
                    "PUT /draft is only allowed for unreleased organisms; organism '$key' is '$status'.",
                )
            }

            val existing = ConfigOrganismDraftsTable.selectAll()
                .where { ConfigOrganismDraftsTable.organismKeyColumn eq key }
                .singleOrNull()

            val newRevision: Long
            if (existing == null) {
                if (ifMatch != null && ifMatch != 0L) {
                    throw OptimisticConcurrencyException(
                        "If-Match=$ifMatch but no draft exists yet (effective revision 0).",
                    )
                }
                ConfigOrganismDraftsTable.insert {
                    it[ConfigOrganismDraftsTable.organismKeyColumn] = key
                    it[ConfigOrganismDraftsTable.configColumn] = newConfig
                    it[ConfigOrganismDraftsTable.baseVersionColumn] = null
                    it[ConfigOrganismDraftsTable.revisionColumn] = 1L
                    it[ConfigOrganismDraftsTable.createdAtColumn] = now
                    it[ConfigOrganismDraftsTable.updatedAtColumn] = now
                    it[ConfigOrganismDraftsTable.createdByColumn] = actor
                    it[ConfigOrganismDraftsTable.updatedByColumn] = actor
                }
                newRevision = 1L
            } else {
                val currentRevision = existing[ConfigOrganismDraftsTable.revisionColumn]
                if (ifMatch != null && ifMatch != currentRevision) {
                    throw OptimisticConcurrencyException(
                        "If-Match=$ifMatch but current draft revision is $currentRevision.",
                    )
                }
                newRevision = currentRevision + 1L
                ConfigOrganismDraftsTable.update({ ConfigOrganismDraftsTable.organismKeyColumn eq key }) {
                    it[ConfigOrganismDraftsTable.configColumn] = newConfig
                    it[ConfigOrganismDraftsTable.revisionColumn] = newRevision
                    it[ConfigOrganismDraftsTable.updatedAtColumn] = now
                    it[ConfigOrganismDraftsTable.updatedByColumn] = actor
                }
            }

            auditLogService.append(
                actor = actor,
                scope = AuditScope.ORGANISM,
                organismKey = key,
                action = AuditAction.DOCUMENT_REPLACE,
                details = mapOf("revision" to newRevision),
            )
            newRevision
        }
    }

    fun appendOrganismOperations(key: String, ops: List<OperationRequest>, ifMatch: Long?, actor: String): Long {
        require(ops.isNotEmpty()) { "At least one operation is required." }
        val now = dateProvider.getCurrentDateTime()
        return transaction {
            val orgRow = ConfigOrganismsTable.selectAll()
                .where { ConfigOrganismsTable.keyColumn eq key }
                .singleOrNull() ?: throw OrganismNotFoundException(key)
            val status = orgRow[ConfigOrganismsTable.statusColumn]
            if (status != "released") {
                throw DraftScopeMismatchException(
                    "POST /draft/operations is only allowed for released organisms; organism '$key' is '$status'.",
                )
            }
            val currentVersion = orgRow[ConfigOrganismsTable.currentVersionColumn]!!

            val (currentConfig, currentRevision) = loadOrCreateOrganismDraft(key, currentVersion, actor, now)
            if (ifMatch != null && ifMatch != currentRevision) {
                throw OptimisticConcurrencyException(
                    "If-Match=$ifMatch but current draft revision is $currentRevision.",
                )
            }

            val batch: AppliedBatch = operationDispatcher.applyMany(ops, ConfigDocument.Organism(currentConfig))
            val newConfig = (batch.newDraft as ConfigDocument.Organism).config
            val newRevision = currentRevision + 1L

            ConfigOrganismDraftsTable.update({ ConfigOrganismDraftsTable.organismKeyColumn eq key }) {
                it[ConfigOrganismDraftsTable.configColumn] = newConfig
                it[ConfigOrganismDraftsTable.revisionColumn] = newRevision
                it[ConfigOrganismDraftsTable.updatedAtColumn] = now
                it[ConfigOrganismDraftsTable.updatedByColumn] = actor
            }

            for (applied in batch.applied) {
                auditLogService.append(
                    actor = actor,
                    scope = AuditScope.ORGANISM,
                    organismKey = key,
                    action = AuditAction.OP_APPEND,
                    details = mapOf(
                        "opType" to applied.opType,
                        "summary" to applied.summary,
                        "revision" to newRevision,
                    ),
                )
            }
            newRevision
        }
    }

    fun discardOrganismDraft(key: String, actor: String) {
        transaction {
            val deleted = ConfigOrganismDraftsTable.deleteWhere { organismKeyColumn eq key }
            if (deleted > 0) {
                auditLogService.append(
                    actor = actor,
                    scope = AuditScope.ORGANISM,
                    organismKey = key,
                    action = AuditAction.DISCARD_DRAFT,
                )
            }
        }
    }

    fun publishOrganism(key: String, actor: String): PublishResult {
        val now = dateProvider.getCurrentDateTime()
        val result = transaction {
            val draft = ConfigOrganismDraftsTable.selectAll()
                .where { ConfigOrganismDraftsTable.organismKeyColumn eq key }
                .singleOrNull() ?: throw NoDraftToPublishException(key)
            val orgRow = ConfigOrganismsTable.selectAll()
                .where { ConfigOrganismsTable.keyColumn eq key }
                .single()

            val draftConfig = draft[ConfigOrganismDraftsTable.configColumn]
            val previousVersion = orgRow[ConfigOrganismsTable.currentVersionColumn]
            val nextVersion = (previousVersion ?: 0L) + 1L

            ConfigOrganismVersionsTable.insert {
                it[ConfigOrganismVersionsTable.organismKeyColumn] = key
                it[ConfigOrganismVersionsTable.versionColumn] = nextVersion
                it[ConfigOrganismVersionsTable.configColumn] = draftConfig
                it[ConfigOrganismVersionsTable.publishedAtColumn] = now
                it[ConfigOrganismVersionsTable.publishedByColumn] = actor
            }

            ConfigOrganismsTable.update({ ConfigOrganismsTable.keyColumn eq key }) {
                it[ConfigOrganismsTable.statusColumn] = "released"
                it[ConfigOrganismsTable.currentVersionColumn] = nextVersion
                if (previousVersion == null) {
                    it[ConfigOrganismsTable.firstPublishedAtColumn] = now
                }
                it[ConfigOrganismsTable.lastPublishedAtColumn] = now
            }

            ConfigOrganismDraftsTable.deleteWhere { organismKeyColumn eq key }

            auditLogService.append(
                actor = actor,
                scope = AuditScope.ORGANISM,
                organismKey = key,
                action = AuditAction.PUBLISH,
                resultVersion = nextVersion,
            )

            PublishResult(
                version = nextVersion,
                previousVersion = previousVersion,
                publishedAt = now,
                publishedBy = actor,
            )
        }
        configService.invalidateCache()
        return result
    }

    fun getInstanceDraft(): InstanceDraftView? = transaction {
        ConfigInstanceDraftTable.selectAll()
            .singleOrNull()
            ?.let {
                InstanceDraftView(
                    config = it[ConfigInstanceDraftTable.configColumn],
                    baseVersion = it[ConfigInstanceDraftTable.baseVersionColumn],
                    revision = it[ConfigInstanceDraftTable.revisionColumn],
                )
            }
    }

    fun putInstanceDraft(newConfig: InstanceConfig, ifMatch: Long?, actor: String): Long {
        val now = dateProvider.getCurrentDateTime()
        return transaction {
            val baseVersion = ConfigInstanceStateTable.selectAll()
                .single()[ConfigInstanceStateTable.currentVersionColumn]

            val existing = ConfigInstanceDraftTable.selectAll().singleOrNull()
            val newRevision: Long
            if (existing == null) {
                if (ifMatch != null && ifMatch != 0L) {
                    throw OptimisticConcurrencyException(
                        "If-Match=$ifMatch but no instance draft exists yet (effective revision 0).",
                    )
                }
                ConfigInstanceDraftTable.insert {
                    it[ConfigInstanceDraftTable.singletonColumn] = true
                    it[ConfigInstanceDraftTable.configColumn] = newConfig
                    it[ConfigInstanceDraftTable.baseVersionColumn] = baseVersion
                    it[ConfigInstanceDraftTable.revisionColumn] = 1L
                    it[ConfigInstanceDraftTable.createdAtColumn] = now
                    it[ConfigInstanceDraftTable.updatedAtColumn] = now
                    it[ConfigInstanceDraftTable.createdByColumn] = actor
                    it[ConfigInstanceDraftTable.updatedByColumn] = actor
                }
                newRevision = 1L
            } else {
                val currentRevision = existing[ConfigInstanceDraftTable.revisionColumn]
                if (ifMatch != null && ifMatch != currentRevision) {
                    throw OptimisticConcurrencyException(
                        "If-Match=$ifMatch but current instance draft revision is $currentRevision.",
                    )
                }
                newRevision = currentRevision + 1L
                ConfigInstanceDraftTable.update({ ConfigInstanceDraftTable.singletonColumn eq true }) {
                    it[ConfigInstanceDraftTable.configColumn] = newConfig
                    it[ConfigInstanceDraftTable.revisionColumn] = newRevision
                    it[ConfigInstanceDraftTable.updatedAtColumn] = now
                    it[ConfigInstanceDraftTable.updatedByColumn] = actor
                }
            }

            auditLogService.append(
                actor = actor,
                scope = AuditScope.INSTANCE,
                organismKey = null,
                action = AuditAction.DOCUMENT_REPLACE,
                details = mapOf("revision" to newRevision),
            )
            newRevision
        }
    }

    fun appendInstanceOperations(ops: List<OperationRequest>, ifMatch: Long?, actor: String): Long {
        require(ops.isNotEmpty()) { "At least one operation is required." }
        val now = dateProvider.getCurrentDateTime()
        return transaction {
            val currentVersion = ConfigInstanceStateTable.selectAll()
                .single()[ConfigInstanceStateTable.currentVersionColumn]
                ?: error("instance has no current_version; migration is broken")

            val (currentConfig, currentRevision) = loadOrCreateInstanceDraft(currentVersion, actor, now)
            if (ifMatch != null && ifMatch != currentRevision) {
                throw OptimisticConcurrencyException(
                    "If-Match=$ifMatch but current instance draft revision is $currentRevision.",
                )
            }
            val batch = operationDispatcher.applyMany(ops, ConfigDocument.Instance(currentConfig))
            val newConfig = (batch.newDraft as ConfigDocument.Instance).config
            val newRevision = currentRevision + 1L

            ConfigInstanceDraftTable.update({ ConfigInstanceDraftTable.singletonColumn eq true }) {
                it[ConfigInstanceDraftTable.configColumn] = newConfig
                it[ConfigInstanceDraftTable.revisionColumn] = newRevision
                it[ConfigInstanceDraftTable.updatedAtColumn] = now
                it[ConfigInstanceDraftTable.updatedByColumn] = actor
            }

            for (applied in batch.applied) {
                auditLogService.append(
                    actor = actor,
                    scope = AuditScope.INSTANCE,
                    organismKey = null,
                    action = AuditAction.OP_APPEND,
                    details = mapOf(
                        "opType" to applied.opType,
                        "summary" to applied.summary,
                        "revision" to newRevision,
                    ),
                )
            }
            newRevision
        }
    }

    fun discardInstanceDraft(actor: String) {
        transaction {
            val deleted = ConfigInstanceDraftTable.deleteWhere { singletonColumn eq true }
            if (deleted > 0) {
                auditLogService.append(
                    actor = actor,
                    scope = AuditScope.INSTANCE,
                    organismKey = null,
                    action = AuditAction.DISCARD_DRAFT,
                )
            }
        }
    }

    fun publishInstance(actor: String): PublishResult {
        val now = dateProvider.getCurrentDateTime()
        val result = transaction {
            val draft = ConfigInstanceDraftTable.selectAll().singleOrNull()
                ?: throw NoDraftToPublishException("instance")
            val draftConfig = draft[ConfigInstanceDraftTable.configColumn]

            val previousVersion = ConfigInstanceStateTable.selectAll()
                .single()[ConfigInstanceStateTable.currentVersionColumn]
            val nextVersion = (previousVersion ?: 0L) + 1L

            ConfigInstanceVersionsTable.insert {
                it[ConfigInstanceVersionsTable.versionColumn] = nextVersion
                it[ConfigInstanceVersionsTable.configColumn] = draftConfig
                it[ConfigInstanceVersionsTable.publishedAtColumn] = now
                it[ConfigInstanceVersionsTable.publishedByColumn] = actor
            }

            ConfigInstanceStateTable.update({ ConfigInstanceStateTable.singletonColumn eq true }) {
                it[ConfigInstanceStateTable.currentVersionColumn] = nextVersion
            }

            ConfigInstanceDraftTable.deleteWhere { singletonColumn eq true }

            auditLogService.append(
                actor = actor,
                scope = AuditScope.INSTANCE,
                organismKey = null,
                action = AuditAction.PUBLISH,
                resultVersion = nextVersion,
            )

            PublishResult(
                version = nextVersion,
                previousVersion = previousVersion,
                publishedAt = now,
                publishedBy = actor,
            )
        }
        configService.invalidateCache()
        return result
    }

    private fun readOrganismDraft(key: String): OrganismDraftView? {
        val row = ConfigOrganismDraftsTable.selectAll()
            .where { ConfigOrganismDraftsTable.organismKeyColumn eq key }
            .singleOrNull() ?: return null
        return OrganismDraftView(
            config = row[ConfigOrganismDraftsTable.configColumn],
            baseVersion = row[ConfigOrganismDraftsTable.baseVersionColumn],
            revision = row[ConfigOrganismDraftsTable.revisionColumn],
            operations = auditLogService.pendingOrganismOps(key).map { entry ->
                PendingOp(
                    opType = entry.details?.get("opType")?.toString() ?: "?",
                    summary = entry.details?.get("summary")?.toString() ?: "?",
                    appliedAt = entry.occurredAt,
                    appliedBy = entry.actor,
                )
            },
        )
    }

    private fun loadOrCreateOrganismDraft(
        key: String,
        currentVersion: Long,
        actor: String,
        now: kotlinx.datetime.LocalDateTime,
    ): Pair<OrganismConfig, Long> {
        val existing = ConfigOrganismDraftsTable.selectAll()
            .where { ConfigOrganismDraftsTable.organismKeyColumn eq key }
            .singleOrNull()
        if (existing != null) {
            return Pair(
                existing[ConfigOrganismDraftsTable.configColumn],
                existing[ConfigOrganismDraftsTable.revisionColumn],
            )
        }
        val currentConfig = ConfigOrganismVersionsTable.selectAll()
            .where { ConfigOrganismVersionsTable.organismKeyColumn eq key }
            .andWhere { ConfigOrganismVersionsTable.versionColumn eq currentVersion }
            .single()[ConfigOrganismVersionsTable.configColumn]
        ConfigOrganismDraftsTable.insert {
            it[ConfigOrganismDraftsTable.organismKeyColumn] = key
            it[ConfigOrganismDraftsTable.configColumn] = currentConfig
            it[ConfigOrganismDraftsTable.baseVersionColumn] = currentVersion
            it[ConfigOrganismDraftsTable.revisionColumn] = 0L
            it[ConfigOrganismDraftsTable.createdAtColumn] = now
            it[ConfigOrganismDraftsTable.updatedAtColumn] = now
            it[ConfigOrganismDraftsTable.createdByColumn] = actor
            it[ConfigOrganismDraftsTable.updatedByColumn] = actor
        }
        return Pair(currentConfig, 0L)
    }

    private fun loadOrCreateInstanceDraft(
        currentVersion: Long,
        actor: String,
        now: kotlinx.datetime.LocalDateTime,
    ): Pair<InstanceConfig, Long> {
        val existing = ConfigInstanceDraftTable.selectAll().singleOrNull()
        if (existing != null) {
            return Pair(
                existing[ConfigInstanceDraftTable.configColumn],
                existing[ConfigInstanceDraftTable.revisionColumn],
            )
        }
        val currentConfig = ConfigInstanceVersionsTable.selectAll()
            .where { ConfigInstanceVersionsTable.versionColumn eq currentVersion }
            .single()[ConfigInstanceVersionsTable.configColumn]
        ConfigInstanceDraftTable.insert {
            it[ConfigInstanceDraftTable.singletonColumn] = true
            it[ConfigInstanceDraftTable.configColumn] = currentConfig
            it[ConfigInstanceDraftTable.baseVersionColumn] = currentVersion
            it[ConfigInstanceDraftTable.revisionColumn] = 0L
            it[ConfigInstanceDraftTable.createdAtColumn] = now
            it[ConfigInstanceDraftTable.updatedAtColumn] = now
            it[ConfigInstanceDraftTable.createdByColumn] = actor
            it[ConfigInstanceDraftTable.updatedByColumn] = actor
        }
        return Pair(currentConfig, 0L)
    }

    data class OrganismDraftView(
        val config: OrganismConfig,
        val baseVersion: Long?,
        val revision: Long,
        val operations: List<PendingOp>,
    )

    data class InstanceDraftView(val config: InstanceConfig, val baseVersion: Long?, val revision: Long)

    data class PendingOp(
        val opType: String,
        val summary: String,
        val appliedAt: kotlinx.datetime.LocalDateTime,
        val appliedBy: String,
    )

    data class PublishResult(
        val version: Long,
        val previousVersion: Long?,
        val publishedAt: kotlinx.datetime.LocalDateTime,
        val publishedBy: String,
    )
}

class DraftScopeMismatchException(message: String) : RuntimeException(message)
class OptimisticConcurrencyException(message: String) : RuntimeException(message)
class NoDraftToPublishException(scope: String) : RuntimeException("No draft to publish for $scope.")
