package org.loculus.backend.maintenance

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.io.TempDir
import org.loculus.backend.service.KeycloakProperties
import java.io.ByteArrayOutputStream
import java.io.PrintStream
import java.nio.file.Files
import java.nio.file.Path
import javax.sql.DataSource

class IdentityBackfillCommandTest {
    @TempDir
    lateinit var reports: Path

    @Test
    fun `missing configuration names are actionable without exposing values`() {
        val issuerVariable = "SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI"
        val env = mapOf(
            issuerVariable to "https://public.example/realms/loculus",
            "KEYCLOAK_USER" to "backend",
            "KEYCLOAK_PASSWORD" to "must-not-appear-in-output",
            "KEYCLOAK_REALM" to "loculus",
            "KEYCLOAK_CLIENT" to "backend-client",
            "KEYCLOAK_URL" to "http://localhost:1",
        )
        for ((index, variable) in listOf(issuerVariable, "KEYCLOAK_REALM", "KEYCLOAK_PASSWORD").withIndex()) {
            val path = reports.resolve("missing-$index.json")
            val output = ByteArrayOutputStream()
            val originalError = System.err
            try {
                PrintStream(output).use { captured ->
                    System.setErr(captured)
                    // Exercise both absent and blank settings; all cases stop before creating connections.
                    val config = if (variable == "KEYCLOAK_PASSWORD") env + (variable to " ") else env - variable
                    assertEquals(
                        1,
                        IdentityBackfillCommand.execute(arrayOf("--apply", "--report", path.toString()), config),
                    )
                }
            } finally {
                System.setErr(originalError)
            }
            assertTrue(output.toString().contains("Missing configuration: $variable"))
            assertFalse(output.toString().contains("must-not-appear-in-output"))
            if (variable == issuerVariable) {
                assertFalse(Files.exists(path))
            } else {
                val text = Files.readString(path)
                val report = jacksonObjectMapper().readTree(text)
                assertEquals("FAILED", report["result"].asText())
                assertEquals("missing_configuration:$variable", report["issues"][0]["reason"].asText())
                assertFalse(text.contains("must-not-appear-in-output"))
            }
        }
    }

    @Test
    fun `mode must be explicit and mutually exclusive`() {
        assertNull(IdentityBackfillCommand.parse(emptyArray()))
        assertNull(IdentityBackfillCommand.parse(arrayOf("--help")))
        assertFalse(IdentityBackfillCommand.parse(arrayOf("--dry-run"))!!.apply)
        assertTrue(IdentityBackfillCommand.parse(arrayOf("--apply"))!!.apply)
        for (args in listOf(arrayOf("--apply", "--dry-run"), arrayOf("--report", "x"), arrayOf("--oops"))) {
            assertThrows<IllegalArgumentException> { IdentityBackfillCommand.parse(args) }
        }
    }

    @Test
    fun `no arguments and help need no configuration or connections`() {
        assertEquals(0, IdentityBackfillCommand.execute(emptyArray(), emptyMap()))
        assertEquals(0, IdentityBackfillCommand.execute(arrayOf("--help"), emptyMap()))
    }

    @Test
    fun `maintenance context has no server migrations scheduler or application services`() {
        // Any accidental datasource connection fails this strict mock.
        val datasource = mockk<DataSource>()
        val properties = KeycloakProperties("backend", "unused", "loculus", "backend-client", "http://localhost:1")
        IdentityBackfillCommand.context(datasource, properties).use { context ->
            val names = context.beanDefinitionNames.toList()
            assertFalse(names.any { it.contains("flyway", true) || it.contains("scheduler", true) })
            assertFalse(names.any { it.contains("controller", true) || it == "backendApplication" })
            assertTrue(names.contains("identityDatabaseService"))
            assertTrue(names.contains("transactionManager"))
        }
    }
}
