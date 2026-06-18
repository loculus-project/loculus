package org.loculus.backend.config

import io.mockk.every
import io.mockk.mockk
import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.Operation
import io.swagger.v3.oas.models.PathItem
import io.swagger.v3.oas.models.Paths
import io.swagger.v3.oas.models.media.StringSchema
import io.swagger.v3.oas.models.parameters.Parameter
import io.swagger.v3.oas.models.parameters.RequestBody
import kotlinx.datetime.LocalDateTime
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.loculus.backend.config.service.ConfigService

class QueryOpenApiCustomizerTest {
    @Test
    fun `view query OpenAPI exposes sequence endpoints only when configured`() {
        val configService = mockk<ConfigService>()
        every { configService.listReleasedOrganisms() } returns emptyList()
        every { configService.getInstanceConfig() } returns ConfigService.VersionedInstance(
            version = 1,
            publishedAt = LocalDateTime(2026, 6, 11, 0, 0),
            publishedBy = "test",
            config = DEFAULT_INSTANCE_CONFIG.copy(
                views = mapOf(
                    "overview" to ViewConfig(
                        displayName = "Overview",
                        query = """select accessionVersion, organism from "enteroviruses"""",
                        schema = schema("Overview"),
                        tableColumns = listOf("organism"),
                        lapisUrl = "http://lapis-overview",
                    ),
                    "real-organisms" to ViewConfig(
                        displayName = "Real organisms",
                        query = """select accessionVersion, organism from "west-nile"""",
                        schema = schema("Real organisms"),
                        tableColumns = listOf("organism"),
                        sequenceData = ViewSequenceData(
                            unalignedNucleotideSequences = ViewUnalignedNucleotideSequences(
                                enabled = true,
                                segments = listOf("main", "L"),
                            ),
                        ),
                        lapisUrl = "http://lapis-real-organisms",
                    ),
                ),
            ),
        )

        val openApi = OpenAPI().paths(
            Paths()
                .addPathItem("/query/{organism}/{versionGroup}/metadata", genericPathItem())
                .addPathItem("/query/{organism}/{versionGroup}/aggregated", genericPathItem())
                .addPathItem("/query/{organism}/{versionGroup}/sequences", genericPathItem())
                .addPathItem("/query/{organism}/{versionGroup}/sequences/{segment}", genericPathItem())
                .addPathItem("/query/{organism}/{versionGroup}/sequencesAligned", genericPathItem()),
        )

        QueryOpenApiCustomizer()
            .organismSpecificQueryOpenApiCustomizer(configService)
            .customise(openApi)

        assertThat(openApi.paths).containsKey("/query/overview/{versionGroup}/metadata")
        assertThat(openApi.paths).containsKey("/query/overview/{versionGroup}/aggregated")
        assertThat(openApi.paths).doesNotContainKey("/query/overview/{versionGroup}/sequences")
        assertThat(openApi.paths).containsKey("/query/real-organisms/{versionGroup}/metadata")
        assertThat(openApi.paths).containsKey("/query/real-organisms/{versionGroup}/aggregated")
        assertThat(openApi.paths).containsKey("/query/real-organisms/{versionGroup}/sequences")
        assertThat(openApi.paths).containsKey("/query/real-organisms/{versionGroup}/sequences/{segment}")
        assertThat(openApi.paths).doesNotContainKey("/query/real-organisms/{versionGroup}/sequencesAligned")
    }

    private fun schema(instanceName: String) = """
        schema:
          instanceName: $instanceName
          opennessLevel: OPEN
          metadata:
            - name: accessionVersion
              type: string
            - name: organism
              type: string
          primaryKey: accessionVersion
          features:
            - name: generalizedAdvancedQuery
    """.trimIndent()

    private fun genericPathItem() = PathItem()
        .post(
            Operation()
                .parameters(
                    listOf(
                        Parameter().name("organism").`in`("path").schema(StringSchema()),
                        Parameter().name("versionGroup").`in`("path").schema(StringSchema()),
                    ),
                )
                .requestBody(RequestBody()),
        )
}
