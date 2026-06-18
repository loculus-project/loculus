package org.loculus.backend.config.fixtures

import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.deleteAll
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.loculus.backend.config.InstanceConfig
import org.loculus.backend.config.OrganismConfig
import org.loculus.backend.config.dbtables.ConfigAuditLogTable
import org.loculus.backend.config.dbtables.ConfigInstanceDraftTable
import org.loculus.backend.config.dbtables.ConfigInstanceStateTable
import org.loculus.backend.config.dbtables.ConfigInstanceVersionsTable
import org.loculus.backend.config.dbtables.ConfigOrganismDraftsTable
import org.loculus.backend.config.dbtables.ConfigOrganismVersionsTable
import org.loculus.backend.config.dbtables.ConfigOrganismsTable
import org.loculus.backend.config.service.ConfigService
import org.loculus.backend.service.submission.dbtables.CurrentProcessingPipelineTable
import org.loculus.backend.utils.DateProvider
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import java.io.File
import javax.sql.DataSource

class ConfigFixtures(
    private val configService: ConfigService,
    private val dateProvider: DateProvider,
    dataSource: DataSource,
) {

    // Fixtures are loaded from JUnit callbacks (e.g. EndpointTestExtension.beforeEach) that run
    // outside any Spring-managed transaction, so a bare `transaction {}` would fall back to
    // Exposed's global default database. That default can be repointed at a mock DataSource by a
    // SpringBootTestWithoutDatabase context running earlier in the same JVM, which then makes the
    // fixture load fail with "no answer found for DataSource.getConnection()". Bind explicitly to
    // this context's real datasource instead.
    private val database = Database.connect(dataSource)

    fun loadDefault() = loadVariant("default")

    fun loadVariant(name: String) {
        val variantDir = File(FIXTURES_ROOT, name)
        require(variantDir.isDirectory) { "No fixture variant directory: ${variantDir.absolutePath}" }

        val instanceFile = File(variantDir, "instance.yaml")
        require(instanceFile.isFile) { "Missing instance.yaml in ${variantDir.absolutePath}" }
        val instance = yamlMapper.readValue(instanceFile, InstanceConfig::class.java)

        val organismsDir = File(variantDir, "organisms")
        require(organismsDir.isDirectory) { "Missing organisms directory in ${variantDir.absolutePath}" }
        val organismFiles = organismsDir.listFiles { _, fn -> fn.endsWith(".yaml") }?.sortedBy { it.name }
            ?: emptyList()

        val now = dateProvider.getCurrentDateTime()

        transaction(database) {
            ConfigAuditLogTable.deleteAll()
            ConfigInstanceDraftTable.deleteAll()
            ConfigOrganismDraftsTable.deleteAll()
            ConfigOrganismVersionsTable.deleteAll()
            ConfigOrganismsTable.deleteAll()
            ConfigInstanceStateTable.deleteAll()
            ConfigInstanceVersionsTable.deleteAll()
            CurrentProcessingPipelineTable.deleteAll()

            ConfigInstanceVersionsTable.insert {
                it[ConfigInstanceVersionsTable.versionColumn] = 1L
                it[ConfigInstanceVersionsTable.configColumn] = instance
                it[ConfigInstanceVersionsTable.publishedAtColumn] = now
                it[ConfigInstanceVersionsTable.publishedByColumn] = SYSTEM_ACTOR
            }
            ConfigInstanceStateTable.insert {
                it[ConfigInstanceStateTable.singletonColumn] = true
                it[ConfigInstanceStateTable.currentVersionColumn] = 1L
            }

            for (file in organismFiles) {
                val key = file.nameWithoutExtension
                val config = yamlMapper.readValue(file, OrganismConfig::class.java)

                ConfigOrganismsTable.insert {
                    it[ConfigOrganismsTable.keyColumn] = key
                    it[ConfigOrganismsTable.statusColumn] = "released"
                    it[ConfigOrganismsTable.currentVersionColumn] = 1L
                    it[ConfigOrganismsTable.deployedColumn] = true
                    it[ConfigOrganismsTable.createdAtColumn] = now
                    it[ConfigOrganismsTable.createdByColumn] = SYSTEM_ACTOR
                    it[ConfigOrganismsTable.firstPublishedAtColumn] = now
                    it[ConfigOrganismsTable.lastPublishedAtColumn] = now
                }
                ConfigOrganismVersionsTable.insert {
                    it[ConfigOrganismVersionsTable.organismKeyColumn] = key
                    it[ConfigOrganismVersionsTable.versionColumn] = 1L
                    it[ConfigOrganismVersionsTable.configColumn] = config
                    it[ConfigOrganismVersionsTable.publishedAtColumn] = now
                    it[ConfigOrganismVersionsTable.publishedByColumn] = SYSTEM_ACTOR
                }
                CurrentProcessingPipelineTable.setV1ForOrganismsIfNotExist(listOf(key), now)
            }
        }
        configService.invalidateCache()
    }

    fun setInstanceConfig(config: InstanceConfig) {
        transaction(database) {
            val currentVersion = ConfigInstanceStateTable.selectAll().single()[
                ConfigInstanceStateTable.currentVersionColumn,
            ] ?: error("no current_version on config_instance_state")
            ConfigInstanceVersionsTable.update({ ConfigInstanceVersionsTable.versionColumn eq currentVersion }) {
                it[ConfigInstanceVersionsTable.configColumn] = config
            }
        }
        configService.invalidateCache()
    }

    companion object {
        private const val FIXTURES_ROOT = "src/test/resources/fixtures"
        private const val SYSTEM_ACTOR = "system"

        private val yamlMapper: ObjectMapper = ObjectMapper(YAMLFactory())
            .registerKotlinModule()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
    }
}

@TestConfiguration
class ConfigFixturesConfig {
    @Bean
    fun configFixtures(
        @Autowired configService: ConfigService,
        @Autowired dateProvider: DateProvider,
        @Autowired dataSource: DataSource,
    ): ConfigFixtures = ConfigFixtures(configService, dateProvider, dataSource)
}
