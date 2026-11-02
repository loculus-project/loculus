package org.loculus.backend.maintenance

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.jetbrains.exposed.v1.spring7.transaction.SpringTransactionManager
import org.loculus.backend.service.KeycloakAdapter
import org.loculus.backend.service.KeycloakProperties
import org.loculus.backend.service.groupmanagement.MembershipDatabaseService
import org.loculus.backend.service.identity.IdentityDatabaseService
import org.loculus.backend.service.identity.IdentityProvisioningService
import org.loculus.backend.utils.DateProvider
import org.springframework.context.annotation.AnnotationConfigApplicationContext
import org.springframework.context.annotation.Bean
import org.springframework.transaction.annotation.EnableTransactionManagement
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import java.nio.file.attribute.PosixFilePermissions
import javax.sql.DataSource
import kotlin.system.exitProcess

data class BackfillOptions(val apply: Boolean, val report: Path)

object IdentityBackfillCommand {
    const val USAGE = "Usage: backfill-identities-and-memberships.sh (--dry-run | --apply) [--report PATH]"

    private class MissingConfiguration(val variable: String) : IllegalArgumentException()

    fun parse(args: Array<String>): BackfillOptions? {
        if (args.isEmpty() || args.contentEquals(arrayOf("--help"))) return null
        require(args.count { it == "--dry-run" || it == "--apply" } == 1) { USAGE }
        require(args.size == 1 || (args.size == 3 && args[1] == "--report")) { USAGE }
        require(args[0] == "--dry-run" || args[0] == "--apply") { USAGE }
        return BackfillOptions(
            args[0] == "--apply",
            Path.of(if (args.size == 3) args[2] else "identity-backfill-${System.currentTimeMillis()}.json"),
        )
    }

    @JvmStatic
    fun main(args: Array<String>) {
        exitProcess(execute(args))
    }

    fun execute(args: Array<String>, environment: Map<String, String> = System.getenv()): Int {
        val options = try {
            parse(args)
        } catch (_: IllegalArgumentException) {
            System.err.println(USAGE)
            return 1
        } ?: run {
            println(USAGE)
            return 0
        }
        fun required(name: String) = environment[name]?.takeIf { it.isNotBlank() }
            ?: throw MissingConfiguration(name)
        var report: IdentityBackfillReport? = null
        try {
            val issuer = required("SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI")
            report = IdentityBackfillReport(if (options.apply) "APPLY" else "DRY_RUN", issuer)
            // CREATE_NEW rejects existing files/symlinks. Reserve a private report before any database writes.
            Files.newByteChannel(
                options.report,
                setOf(StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE),
                PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")),
            ).use { channel ->
                java.nio.channels.Channels.newWriter(channel, Charsets.UTF_8).use { writer ->
                    try {
                        val keycloak = KeycloakProperties(
                            required("KEYCLOAK_USER"),
                            required("KEYCLOAK_PASSWORD"),
                            required("KEYCLOAK_REALM"),
                            required("KEYCLOAK_CLIENT"),
                            required("KEYCLOAK_URL"),
                        )
                        val pool = HikariConfig().apply {
                            jdbcUrl = required("SPRING_DATASOURCE_URL")
                            username = required("SPRING_DATASOURCE_USERNAME")
                            password = required("SPRING_DATASOURCE_PASSWORD")
                            maximumPoolSize = 3
                            initializationFailTimeout = -1
                            isReadOnly = !options.apply
                        }
                        HikariDataSource(pool).use { dataSource ->
                            context(dataSource, keycloak).use { context ->
                                IdentityBackfillService(
                                    context.getBean(KeycloakAdapter::class.java),
                                    context.getBean(IdentityDatabaseService::class.java),
                                    context.getBean(IdentityProvisioningService::class.java),
                                    context.getBean(MembershipDatabaseService::class.java),
                                ).run(options.apply, report)
                            }
                        }
                    } catch (error: Exception) {
                        report.result = "FAILED"
                        // Only our own missing-variable names are safe to expose, never values or HTTP/SQL messages.
                        val reason = if (error is MissingConfiguration) {
                            System.err.println("Missing configuration: ${error.variable}")
                            "missing_configuration:${error.variable}"
                        } else {
                            "execution_failed:${error.javaClass.simpleName}"
                        }
                        report.issues.add(BackfillIssue(reason))
                    } finally {
                        writer.write(jacksonObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(report))
                        writer.flush()
                    }
                }
            }
            println(
                "${report.mode}: ${report.result}; accounts=${report.accountsScanned}, " +
                    "identities needing provisioning=${report.identitiesNeedingProvisioning}, " +
                    "memberships to link=${report.membershipsToLink}, linked=${report.membershipsLinked}, " +
                    "issues=${report.issues.size}. Report: ${options.report}",
            )
            return report.exitCode()
        } catch (error: Exception) {
            if (error is MissingConfiguration) {
                System.err.println("Missing configuration: ${error.variable}")
                return 1
            }
            System.err.println(
                "Backfill failed (${error.javaClass.simpleName}); no automatic retry. " +
                    "Earlier committed work may remain. Check configuration and report path.",
            )
            return 1
        }
    }

    /** No Boot auto-configuration or component scan: no HTTP, Flyway, scheduled jobs or consumers. */
    fun context(dataSource: DataSource, properties: KeycloakProperties): AnnotationConfigApplicationContext =
        AnnotationConfigApplicationContext().apply {
            registerBean("dataSource", DataSource::class.java, java.util.function.Supplier { dataSource })
            registerBean(
                "keycloakProperties",
                KeycloakProperties::class.java,
                java.util.function.Supplier {
                    properties
                },
            )
            register(
                BackfillTransactions::class.java,
                DateProvider::class.java,
                KeycloakAdapter::class.java,
                IdentityDatabaseService::class.java,
                IdentityProvisioningService::class.java,
                MembershipDatabaseService::class.java,
            )
            refresh()
        }
}

// Intentionally not @Configuration/@Component: only the explicit command context registers this class.
@EnableTransactionManagement
class BackfillTransactions {
    @Bean
    fun transactionManager(dataSource: DataSource) = SpringTransactionManager(dataSource)
}
