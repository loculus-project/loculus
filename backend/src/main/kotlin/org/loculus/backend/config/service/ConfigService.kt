package org.loculus.backend.config.service

import kotlinx.datetime.LocalDateTime
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.loculus.backend.api.Organism
import org.loculus.backend.config.InstanceConfig
import org.loculus.backend.config.OrganismConfig
import org.loculus.backend.config.dbtables.ConfigInstanceStateTable
import org.loculus.backend.config.dbtables.ConfigInstanceVersionsTable
import org.loculus.backend.config.dbtables.ConfigOrganismVersionsTable
import org.loculus.backend.config.dbtables.ConfigOrganismsTable
import org.springframework.stereotype.Service
import java.util.concurrent.ConcurrentHashMap

@Service
class ConfigService {

    @Volatile
    private var instanceCache: VersionedInstance? = null
    private val organismCache: MutableMap<String, VersionedOrganism> = ConcurrentHashMap()

    fun getInstanceConfig(): VersionedInstance {
        instanceCache?.let { return it }
        return transaction {
            val state = ConfigInstanceStateTable.selectAll().single()
            val currentVersion = state[ConfigInstanceStateTable.currentVersionColumn]
                ?: error("config_instance_state has no current_version; migration is broken")
            val row = ConfigInstanceVersionsTable.selectAll()
                .where { ConfigInstanceVersionsTable.versionColumn eq currentVersion }
                .single()
            val loaded = VersionedInstance(
                version = currentVersion,
                publishedAt = row[ConfigInstanceVersionsTable.publishedAtColumn],
                publishedBy = row[ConfigInstanceVersionsTable.publishedByColumn],
                config = row[ConfigInstanceVersionsTable.configColumn],
            )
            instanceCache = loaded
            loaded
        }
    }

    fun getInstanceVersion(version: Long): VersionedInstance? = transaction {
        ConfigInstanceVersionsTable.selectAll()
            .where { ConfigInstanceVersionsTable.versionColumn eq version }
            .map {
                VersionedInstance(
                    version = it[ConfigInstanceVersionsTable.versionColumn],
                    publishedAt = it[ConfigInstanceVersionsTable.publishedAtColumn],
                    publishedBy = it[ConfigInstanceVersionsTable.publishedByColumn],
                    config = it[ConfigInstanceVersionsTable.configColumn],
                )
            }
            .singleOrNull()
    }

    fun getOrganismConfig(key: String): VersionedOrganism {
        organismCache[key]?.let { return it }
        val loaded = transaction {
            val orgRow = ConfigOrganismsTable.selectAll()
                .where { ConfigOrganismsTable.keyColumn eq key }
                .singleOrNull() ?: throw OrganismNotFoundException(key)
            val currentVersion = orgRow[ConfigOrganismsTable.currentVersionColumn]
                ?: throw OrganismNotFoundException(key)
            val versionRow = ConfigOrganismVersionsTable.selectAll()
                .where { ConfigOrganismVersionsTable.organismKeyColumn eq key }
                .andWhere { ConfigOrganismVersionsTable.versionColumn eq currentVersion }
                .single()
            VersionedOrganism(
                key = key,
                version = currentVersion,
                publishedAt = versionRow[ConfigOrganismVersionsTable.publishedAtColumn],
                publishedBy = versionRow[ConfigOrganismVersionsTable.publishedByColumn],
                config = versionRow[ConfigOrganismVersionsTable.configColumn],
            )
        }
        organismCache[key] = loaded
        return loaded
    }

    fun getOrganismConfig(organism: Organism): VersionedOrganism = getOrganismConfig(organism.name)

    fun getOrganismVersion(key: String, version: Long): VersionedOrganism? = transaction {
        ConfigOrganismVersionsTable.selectAll()
            .where { ConfigOrganismVersionsTable.organismKeyColumn eq key }
            .andWhere { ConfigOrganismVersionsTable.versionColumn eq version }
            .map {
                VersionedOrganism(
                    key = key,
                    version = version,
                    publishedAt = it[ConfigOrganismVersionsTable.publishedAtColumn],
                    publishedBy = it[ConfigOrganismVersionsTable.publishedByColumn],
                    config = it[ConfigOrganismVersionsTable.configColumn],
                )
            }
            .singleOrNull()
    }

    fun listOrganismKeys(): Set<String> = transaction {
        ConfigOrganismsTable.selectAll()
            .where { ConfigOrganismsTable.statusColumn eq "released" }
            .andWhere { ConfigOrganismsTable.deployedColumn eq true }
            .map { it[ConfigOrganismsTable.keyColumn] }
            .toSet()
    }

    fun listReleasedOrganisms(): List<OrganismListing> = transaction {
        ConfigOrganismsTable.selectAll()
            .where { ConfigOrganismsTable.statusColumn eq "released" }
            .andWhere { ConfigOrganismsTable.deployedColumn eq true }
            .orderBy(ConfigOrganismsTable.keyColumn to SortOrder.ASC)
            .map { it.toOrganismListing() }
    }

    fun listAllOrganisms(): List<OrganismListing> = transaction {
        ConfigOrganismsTable.selectAll()
            .orderBy(ConfigOrganismsTable.keyColumn to SortOrder.ASC)
            .map { it.toOrganismListing() }
    }

    fun listOrganismVersions(key: String): List<VersionListing> = transaction {
        ConfigOrganismVersionsTable.selectAll()
            .where { ConfigOrganismVersionsTable.organismKeyColumn eq key }
            .orderBy(ConfigOrganismVersionsTable.versionColumn to SortOrder.DESC)
            .map {
                VersionListing(
                    version = it[ConfigOrganismVersionsTable.versionColumn],
                    publishedAt = it[ConfigOrganismVersionsTable.publishedAtColumn],
                    publishedBy = it[ConfigOrganismVersionsTable.publishedByColumn],
                )
            }
    }

    fun listInstanceVersions(): List<VersionListing> = transaction {
        ConfigInstanceVersionsTable.selectAll()
            .orderBy(ConfigInstanceVersionsTable.versionColumn to SortOrder.DESC)
            .map {
                VersionListing(
                    version = it[ConfigInstanceVersionsTable.versionColumn],
                    publishedAt = it[ConfigInstanceVersionsTable.publishedAtColumn],
                    publishedBy = it[ConfigInstanceVersionsTable.publishedByColumn],
                )
            }
    }

    fun invalidateCache() {
        instanceCache = null
        organismCache.clear()
    }

    data class VersionedInstance(
        val version: Long,
        val publishedAt: LocalDateTime,
        val publishedBy: String,
        val config: InstanceConfig,
    )

    data class VersionedOrganism(
        val key: String,
        val version: Long,
        val publishedAt: LocalDateTime,
        val publishedBy: String,
        val config: OrganismConfig,
    )

    data class OrganismListing(val key: String, val status: String, val currentVersion: Long?, val deployed: Boolean)

    data class VersionListing(val version: Long, val publishedAt: LocalDateTime, val publishedBy: String)

    private fun org.jetbrains.exposed.sql.ResultRow.toOrganismListing() = OrganismListing(
        key = this[ConfigOrganismsTable.keyColumn],
        status = this[ConfigOrganismsTable.statusColumn],
        currentVersion = this[ConfigOrganismsTable.currentVersionColumn],
        deployed = this[ConfigOrganismsTable.deployedColumn],
    )
}

class OrganismNotFoundException(val key: String) : RuntimeException("Organism not found or unreleased: $key")
