package org.loculus.backend.config

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

/**
 * Guards the hand-maintained mirrors of the default instance config: the Kotlin
 * [DEFAULT_INSTANCE_CONFIG] object, the [DEFAULT_INSTANCE_CONFIG_JSON] literal,
 * and (indirectly) the canonical Zod schema / DB seed. If a new InstanceConfig
 * field is added without updating the JSON literal, this test fails.
 */
class InstanceConfigSerializationTest {
    private val objectMapper = jacksonObjectMapper()

    @Test
    fun `DEFAULT_INSTANCE_CONFIG_JSON deserializes to DEFAULT_INSTANCE_CONFIG`() {
        val parsed = objectMapper.readValue<InstanceConfig>(DEFAULT_INSTANCE_CONFIG_JSON)
        assertThat(parsed).isEqualTo(DEFAULT_INSTANCE_CONFIG)
    }

    @Test
    fun `DEFAULT_INSTANCE_CONFIG serializes to DEFAULT_INSTANCE_CONFIG_JSON`() {
        val serialized = objectMapper.writeValueAsString(DEFAULT_INSTANCE_CONFIG)
        assertThat(serialized).isEqualTo(DEFAULT_INSTANCE_CONFIG_JSON)
    }

    @Test
    fun `overview config round-trips`() {
        val config = DEFAULT_INSTANCE_CONFIG.copy(
            views = mapOf(
                "overview" to ViewConfig(
                    displayName = "Overview",
                    query = """select accessionVersion, country from "ebola"""",
                    schema = """
                        schema:
                          instanceName: Overview
                          opennessLevel: OPEN
                          metadata:
                            - name: accessionVersion
                              type: string
                            - name: country
                              type: string
                          primaryKey: accessionVersion
                          features:
                            - name: generalizedAdvancedQuery
                    """.trimIndent(),
                    tableColumns = listOf("organism", "country"),
                ),
                "test-organisms" to ViewConfig(
                    displayName = "Test organisms",
                    query = """select accessionVersion, country from "dummy-organism"""",
                    schema = """
                        schema:
                          instanceName: Test organisms
                          opennessLevel: OPEN
                          metadata:
                            - name: accessionVersion
                              type: string
                            - name: country
                              type: string
                          primaryKey: accessionVersion
                          features:
                            - name: generalizedAdvancedQuery
                    """.trimIndent(),
                    tableColumns = listOf("organism", "country"),
                ),
            ),
            overview = OverviewConfig(
                displayName = "Overview",
                query = """select accessionVersion, country from "ebola"""",
                schema = """
                    schema:
                      instanceName: Overview
                      opennessLevel: OPEN
                      metadata:
                        - name: accessionVersion
                          type: string
                        - name: country
                          type: string
                      primaryKey: accessionVersion
                      features:
                        - name: generalizedAdvancedQuery
                """.trimIndent(),
                tableColumns = listOf("organism", "country"),
            ),
        )
        val roundTripped = objectMapper.readValue<InstanceConfig>(objectMapper.writeValueAsString(config))
        assertThat(roundTripped).isEqualTo(config)
    }
}
