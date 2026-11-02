package org.loculus.backend.maintenance

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.testcontainers.postgresql.PostgreSQLContainer
import org.testcontainers.utility.DockerImageName
import java.net.InetSocketAddress
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermissions
import java.sql.DriverManager

class IdentityBackfillCommandIntegrationTest {
    @TempDir
    lateinit var reports: Path

    @Test
    fun `real command uses read-only credentials for dry run and safely applies reruns and reports`() {
        val image = DockerImageName.parse("ghcr.io/loculus-project/mirror/postgres:15.19")
            .asCompatibleSubstituteFor("postgres")
        PostgreSQLContainer(image).use { postgres ->
            postgres.start()
            fun connection() = DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password)
            connection().use { connection ->
                connection.createStatement().use { sql ->
                    sql.execute("create table groups_table(group_id serial primary key)")
                    sql.execute(
                        "create table user_groups_table(id serial primary key, user_name text not null, " +
                            "group_id int not null references groups_table(group_id), unique(user_name, group_id))",
                    )
                    for (migration in listOf(
                        "V1.36__add_loculus_identity.sql",
                        "V1.37__link_group_memberships_to_loculus_users.sql",
                    )) {
                        sql.execute(Files.readString(Path.of("src/main/resources/db/migration/$migration")))
                    }
                    sql.execute("insert into groups_table values (1)")
                    sql.execute("insert into user_groups_table(user_name, group_id) values ('SNEHA', 1)")
                    sql.execute("create role backfill_reader login password 'local-test-only'")
                    sql.execute("grant select on all tables in schema public to backfill_reader")
                }
            }
            fun count(table: String): Int = connection().use { c ->
                c.createStatement().use { s ->
                    s.executeQuery("select count(*) from $table").use {
                        it.next()
                        it.getInt(1)
                    }
                }
            }
            val requests = java.util.Collections.synchronizedList(mutableListOf<String>())
            var failProvider = false
            val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
            server.createContext("/") { exchange ->
                val uri = exchange.requestURI
                requests.add(uri.toString())
                val token = uri.path.endsWith("/token")
                val status = if (!token && failProvider) 503 else 200
                val body = when {
                    token -> """{"access_token":"test-token-not-for-logging","token_type":"Bearer","expires_in":300}"""

                    failProvider -> """{"error":"unavailable"}"""

                    uri.rawQuery.contains("first=0") -> """
                        [
                          {"id":"subject-1","username":"sneha","enabled":true},
                          {"id":"service-1","username":"service-account-importer","enabled":false}
                        ]
                    """.trimIndent()

                    else -> "[]"
                }.toByteArray()
                exchange.responseHeaders.set("Content-Type", "application/json")
                exchange.sendResponseHeaders(status, body.size.toLong())
                exchange.responseBody.use { it.write(body) }
            }
            server.start()
            try {
                val env = mapOf(
                    "SPRING_DATASOURCE_URL" to postgres.jdbcUrl,
                    "SPRING_DATASOURCE_USERNAME" to postgres.username,
                    "SPRING_DATASOURCE_PASSWORD" to postgres.password,
                    "KEYCLOAK_URL" to "http://127.0.0.1:${server.address.port}",
                    "KEYCLOAK_REALM" to "loculus", "KEYCLOAK_CLIENT" to "backend-client",
                    "KEYCLOAK_USER" to "backend", "KEYCLOAK_PASSWORD" to "unused-test-secret",
                    "SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI" to "https://public.example/realms/loculus",
                )
                fun run(mode: String, name: String, config: Map<String, String> = env) =
                    IdentityBackfillCommand.execute(
                        arrayOf(mode, "--report", reports.resolve(name).toString()),
                        config,
                    )
                assertEquals(
                    0,
                    run(
                        "--dry-run",
                        "dry.json",
                        env + mapOf(
                            "SPRING_DATASOURCE_USERNAME" to "backfill_reader",
                            "SPRING_DATASOURCE_PASSWORD" to "local-test-only",
                        ),
                    ),
                )
                assertEquals(0, count("loculus_users"))
                assertTrue(
                    requests.filter { it.contains("/users?") }.all {
                        it.contains("exact=false") && !it.contains("enabled=") && !it.contains("search=")
                    },
                    requests.toString(),
                )
                assertTrue(requests.any { it.contains("first=2") })
                assertEquals(0, run("--apply", "apply.json"))
                assertEquals(2, count("loculus_users"))
                assertEquals(0, run("--apply", "again.json"))
                val json = jacksonObjectMapper().readTree(Files.readString(reports.resolve("again.json")))
                assertEquals(0, json["identitiesNeedingProvisioning"].asInt())
                assertEquals(1, json["membershipsAlreadyLinked"].asInt())
                assertFalse(Files.readString(reports.resolve("apply.json")).contains("test-token-not-for-logging"))
                assertEquals(
                    PosixFilePermissions.fromString("rw-------"),
                    Files.getPosixFilePermissions(reports.resolve("apply.json")),
                )
                // Existing reports are never overwritten and no provider requests are made on this failure.
                val requestCount = requests.size
                assertEquals(1, run("--apply", "apply.json"))
                assertEquals(requestCount, requests.size)
                failProvider = true
                assertEquals(1, run("--apply", "failure.json"))
                assertEquals(
                    "FAILED",
                    jacksonObjectMapper().readTree(
                        Files.readString(reports.resolve("failure.json")),
                    )["result"].asText(),
                )
                assertEquals(2, count("loculus_users"))
            } finally {
                server.stop(0)
            }
        }
    }
}
