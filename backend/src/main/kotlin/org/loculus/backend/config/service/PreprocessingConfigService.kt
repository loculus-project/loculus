package org.loculus.backend.config.service

import kotlinx.datetime.LocalDateTime
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.loculus.backend.config.dbtables.ConfigOrganismsTable
import org.loculus.backend.config.dbtables.ConfigPreprocessingFilesTable
import org.loculus.backend.utils.DateProvider
import org.springframework.stereotype.Service

/**
 * Stores and serves opaque, unversioned preprocessing config files, keyed by
 * (organism, pipeline version). The backend never parses or interprets the
 * content — it is a generic text channel for external preprocessing pipelines.
 * Editing is a direct save (no draft/publish/version flow); the current value
 * is what gets served.
 */
@Service
class PreprocessingConfigService(private val dateProvider: DateProvider) {

    fun getConfigFile(organismKey: String, pipelineVersion: Long): String? = transaction {
        ConfigPreprocessingFilesTable.selectAll()
            .where { ConfigPreprocessingFilesTable.organismKeyColumn eq organismKey }
            .andWhere { ConfigPreprocessingFilesTable.pipelineVersionColumn eq pipelineVersion }
            .map { it[ConfigPreprocessingFilesTable.configFileColumn] }
            .singleOrNull()
    }

    fun listVersions(organismKey: String): List<PreprocessingConfigVersion> = transaction {
        requireOrganismExists(organismKey)
        ConfigPreprocessingFilesTable.selectAll()
            .where { ConfigPreprocessingFilesTable.organismKeyColumn eq organismKey }
            .orderBy(ConfigPreprocessingFilesTable.pipelineVersionColumn to SortOrder.ASC)
            .map {
                PreprocessingConfigVersion(
                    pipelineVersion = it[ConfigPreprocessingFilesTable.pipelineVersionColumn],
                    updatedAt = it[ConfigPreprocessingFilesTable.updatedAtColumn],
                    updatedBy = it[ConfigPreprocessingFilesTable.updatedByColumn],
                )
            }
    }

    fun setConfigFile(organismKey: String, pipelineVersion: Long, content: String, updatedBy: String) {
        val now = dateProvider.getCurrentDateTime()
        transaction {
            requireOrganismExists(organismKey)
            val updated = ConfigPreprocessingFilesTable.update({
                (ConfigPreprocessingFilesTable.organismKeyColumn eq organismKey) and
                    (ConfigPreprocessingFilesTable.pipelineVersionColumn eq pipelineVersion)
            }) {
                it[configFileColumn] = content
                it[updatedAtColumn] = now
                it[updatedByColumn] = updatedBy
            }
            if (updated == 0) {
                ConfigPreprocessingFilesTable.insert {
                    it[organismKeyColumn] = organismKey
                    it[pipelineVersionColumn] = pipelineVersion
                    it[configFileColumn] = content
                    it[updatedAtColumn] = now
                    it[updatedByColumn] = updatedBy
                }
            }
        }
    }

    fun deleteConfigFile(organismKey: String, pipelineVersion: Long): Boolean = transaction {
        ConfigPreprocessingFilesTable.deleteWhere {
            (ConfigPreprocessingFilesTable.organismKeyColumn eq organismKey) and
                (ConfigPreprocessingFilesTable.pipelineVersionColumn eq pipelineVersion)
        } > 0
    }

    private fun requireOrganismExists(organismKey: String) {
        val exists = ConfigOrganismsTable.selectAll()
            .where { ConfigOrganismsTable.keyColumn eq organismKey }
            .limit(1)
            .any()
        if (!exists) throw OrganismNotFoundException(organismKey)
    }

    data class PreprocessingConfigVersion(
        val pipelineVersion: Long,
        val updatedAt: LocalDateTime,
        val updatedBy: String,
    )
}
