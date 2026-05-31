package org.loculus.backend.config.service

import org.jetbrains.exposed.exceptions.ExposedSQLException
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.loculus.backend.config.dbtables.ConfigOrganismsTable
import org.loculus.backend.service.submission.dbtables.CurrentProcessingPipelineTable
import org.loculus.backend.utils.DateProvider
import org.springframework.stereotype.Service

@Service
class OrganismAdminService(
    private val configService: ConfigService,
    private val auditLogService: AuditLogService,
    private val dateProvider: DateProvider,
) {

    fun createOrganism(key: String, createdBy: String): ConfigService.OrganismListing {
        require(key.isNotBlank()) { "organism key must not be blank" }
        val now = dateProvider.getCurrentDateTime()
        return transaction {
            val existing = ConfigOrganismsTable.selectAll()
                .where { ConfigOrganismsTable.keyColumn eq key }
                .limit(1)
                .toList()
            if (existing.isNotEmpty()) {
                throw OrganismAlreadyExistsException(key)
            }
            try {
                ConfigOrganismsTable.insert {
                    it[ConfigOrganismsTable.keyColumn] = key
                    it[ConfigOrganismsTable.statusColumn] = "unreleased"
                    it[ConfigOrganismsTable.currentVersionColumn] = null
                    it[ConfigOrganismsTable.deployedColumn] = false
                    it[ConfigOrganismsTable.createdAtColumn] = now
                    it[ConfigOrganismsTable.createdByColumn] = createdBy
                    it[ConfigOrganismsTable.firstPublishedAtColumn] = null
                    it[ConfigOrganismsTable.lastPublishedAtColumn] = null
                }
            } catch (e: ExposedSQLException) {
                throw OrganismAlreadyExistsException(key)
            }

            CurrentProcessingPipelineTable.setV1ForOrganismsIfNotExist(listOf(key), now)
            auditLogService.append(
                actor = createdBy,
                scope = AuditScope.ORGANISM,
                organismKey = key,
                action = AuditAction.ORGANISM_CREATE,
            )

            configService.invalidateCache()

            ConfigService.OrganismListing(key = key, status = "unreleased", currentVersion = null, deployed = false)
        }
    }

    fun markDeployed(key: String, actor: String): ConfigService.OrganismListing = transaction {
        val row = ConfigOrganismsTable.selectAll()
            .where { ConfigOrganismsTable.keyColumn eq key }
            .singleOrNull() ?: throw OrganismNotFoundException(key)

        val status = row[ConfigOrganismsTable.statusColumn]
        val currentVersion = row[ConfigOrganismsTable.currentVersionColumn]
        if (status != "released" || currentVersion == null) {
            throw OrganismDeploymentException("Only released organisms can be marked deployed.")
        }

        val wasDeployed = row[ConfigOrganismsTable.deployedColumn]
        if (!wasDeployed) {
            ConfigOrganismsTable.update({ ConfigOrganismsTable.keyColumn eq key }) {
                it[ConfigOrganismsTable.deployedColumn] = true
            }
            auditLogService.append(
                actor = actor,
                scope = AuditScope.ORGANISM,
                organismKey = key,
                action = AuditAction.MARK_DEPLOYED,
                details = mapOf("version" to currentVersion),
            )
            configService.invalidateCache()
        }

        ConfigService.OrganismListing(
            key = key,
            status = status,
            currentVersion = currentVersion,
            deployed = true,
        )
    }
}

class OrganismAlreadyExistsException(val key: String) : RuntimeException("Organism '$key' already exists.")
class OrganismDeploymentException(message: String) : RuntimeException(message)
