package org.loculus.backend.controller

import io.mockk.every
import io.mockk.mockk
import io.swagger.v3.core.util.Json
import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.PathItem
import io.swagger.v3.oas.models.Paths
import io.swagger.v3.oas.models.info.Info
import jakarta.servlet.http.HttpServletRequest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springdoc.webmvc.api.OpenApiWebMvcResource

class OpenApiSplitControllerTest {

    private val request = mockk<HttpServletRequest>(relaxed = true)

    @Test
    fun `query JSON contains only paths for the requested organism`() {
        val controller = OpenApiSplitController(openApiResource())

        val response = controller.queryJson(request, "real-organisms")
        val openApi = Json.mapper().readValue(response.body, OpenAPI::class.java)

        assertThat(openApi.paths.keys).containsExactly("/query/real-organisms/{versionGroup}/metadata")
    }

    @Test
    fun `general JSON excludes query paths`() {
        val controller = OpenApiSplitController(openApiResource())

        val response = controller.generalJson(request)
        val openApi = Json.mapper().readValue(response.body, OpenAPI::class.java)

        assertThat(openApi.paths.keys).containsExactly("/{organism}/submit")
    }

    private fun openApiResource(): OpenApiWebMvcResource {
        val resource = mockk<OpenApiWebMvcResource>()
        every { resource.openapiJson(any(), any(), any()) } returns Json.mapper().writeValueAsBytes(
            OpenAPI()
                .info(Info().title("Loculus").version("test"))
                .paths(
                    Paths()
                        .addPathItem(
                            "/query/overview/{versionGroup}/metadata",
                            PathItem().get(io.swagger.v3.oas.models.Operation()),
                        )
                        .addPathItem(
                            "/query/real-organisms/{versionGroup}/metadata",
                            PathItem().get(io.swagger.v3.oas.models.Operation()),
                        )
                        .addPathItem("/{organism}/submit", PathItem().post(io.swagger.v3.oas.models.Operation())),
                ),
        )
        return resource
    }
}
