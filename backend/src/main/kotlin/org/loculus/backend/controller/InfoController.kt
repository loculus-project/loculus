package org.loculus.backend.controller

import com.fasterxml.jackson.databind.ObjectMapper
import io.swagger.v3.oas.annotations.Hidden
import jakarta.servlet.http.HttpServletRequest
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.config.DEBUG_MODE_ON_VALUE
import org.loculus.backend.config.configuredViews
import org.loculus.backend.config.service.ConfigService
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

const val PROJECT_NAME = "Loculus"
private const val DEFAULT_API_DOCS_URL = "/api-docs.json"
private const val DATA_USE_TERMS_PATH = "/about/terms-of-use/data-use-terms"

@Hidden
@RestController
class InfoController(
    @Value("\${${BackendSpringProperty.DEBUG_MODE}}") private val debugMode: String,
    private val configService: ConfigService,
    private val backendConfig: BackendConfig,
) {

    @RequestMapping("/", produces = [MediaType.TEXT_HTML_VALUE])
    fun htmlInfo(request: HttpServletRequest) = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>$PROJECT_NAME Backend</title>
        </head>
        <body>
            <h1>Welcome to the $PROJECT_NAME Backend</h1>
            <a href="${request.requestURL}swagger-ui/loculus">Visit our Swagger UI</a>
            <br>
            <a href="${request.requestURL}scalar-api-reference">Visit our Scalar API reference</a>
        </body>
        </html>
    """.trimIndent()

    @RequestMapping("/swagger-ui/loculus", produces = [MediaType.TEXT_HTML_VALUE])
    fun swaggerUiWithLoculusBar(@RequestParam(defaultValue = DEFAULT_API_DOCS_URL) url: String): String {
        val resolvedUrl = resolveSpecUrl(url)
        val specUrl = ObjectMapper().writeValueAsString(resolvedUrl)
        return docsShell(
            url = resolvedUrl,
            mode = ApiDocsMode.SWAGGER,
            extraHead = """
                <link rel="stylesheet" type="text/css" href="/swagger-ui/swagger-ui.css" />
                <link rel="stylesheet" type="text/css" href="/swagger-ui/index.css" />
            """.trimIndent(),
            content = """
                <div id="swagger-ui"></div>
                <script src="/swagger-ui/swagger-ui-bundle.js" charset="UTF-8"></script>
                <script src="/swagger-ui/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
                <script>
                    window.ui = SwaggerUIBundle({
                        url: $specUrl,
                        dom_id: '#swagger-ui',
                        deepLinking: true,
                        presets: [
                            SwaggerUIBundle.presets.apis,
                            SwaggerUIStandalonePreset
                        ],
                        plugins: [
                            SwaggerUIBundle.plugins.DownloadUrl
                        ],
                        layout: 'StandaloneLayout',
                        operationsSorter: 'alpha',
                        validatorUrl: ''
                    });
                </script>
            """.trimIndent(),
        )
    }

    @RequestMapping("/scalar-api-reference", produces = [MediaType.TEXT_HTML_VALUE])
    fun scalarApiReference(@RequestParam(defaultValue = DEFAULT_API_DOCS_URL) url: String): String {
        val resolvedUrl = resolveSpecUrl(url)
        val specUrl = ObjectMapper().writeValueAsString(resolvedUrl)
        return docsShell(
            url = resolvedUrl,
            mode = ApiDocsMode.SCALAR,
            content = """
            <div id="app"></div>
            <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
            <script>
                Scalar.createApiReference('#app', {
                    url: $specUrl
                })
            </script>
            """.trimIndent(),
        )
    }

    private fun docsShell(url: String, mode: ApiDocsMode, content: String, extraHead: String = ""): String {
        val bar = docsBar(url, mode)
        return """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>$PROJECT_NAME API Reference</title>
            $extraHead
            <style>
                html, body {
                    height: 100%;
                    margin: 0;
                }
                body {
                    display: flex;
                    flex-direction: column;
                    font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                }
                .loculus-docs-bar {
                    min-height: 52px;
                    box-sizing: border-box;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 8px 16px;
                    border-bottom: 1px solid #d7dde5;
                    background: #ffffff;
                    color: #1f2937;
                    font-size: 14px;
                    flex-wrap: wrap;
                }
                .loculus-docs-bar a {
                    color: #075985;
                    font-weight: 600;
                    text-decoration: none;
                }
                .loculus-docs-bar a:hover {
                    text-decoration: underline;
                }
                .loculus-docs-bar label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: 600;
                }
                .loculus-docs-bar select {
                    min-width: 260px;
                    max-width: min(520px, 80vw);
                    padding: 5px 28px 5px 8px;
                    border: 1px solid #aab4c0;
                    border-radius: 6px;
                    background: #ffffff;
                    color: #111827;
                    font: inherit;
                }
                .loculus-docs-terms {
                    margin-left: auto;
                    color: #4b5563;
                }
                #app,
                #swagger-ui {
                    flex: 1;
                    min-height: 0;
                    overflow: auto;
                }
                @media (max-width: 800px) {
                    .loculus-docs-bar {
                        align-items: stretch;
                    }
                    .loculus-docs-terms {
                        margin-left: 0;
                        width: 100%;
                    }
                    .loculus-docs-bar label,
                    .loculus-docs-bar select {
                        width: 100%;
                    }
                }
            </style>
        </head>
        <body>
            $bar
            $content
            <script>
                document.getElementById('loculus-docs-spec').addEventListener('change', function (event) {
                    const selectedUrl = event.target.value;
                    const mode = event.target.dataset.mode;
                    const basePath = mode === 'swagger' ? '/swagger-ui/loculus' : '/scalar-api-reference';
                    window.location.href = basePath + '?url=' + encodeURIComponent(selectedUrl);
                });
            </script>
        </body>
        </html>
        """.trimIndent()
    }

    private fun docsBar(url: String, mode: ApiDocsMode): String {
        val options = apiDocOptions()
            .joinToString("\n") { option ->
                val selected = if (option.url == url) " selected" else ""
                """<option value="${htmlEscape(option.url)}"$selected>${htmlEscape(option.label)}</option>"""
            }
        val terms = dataUseTermsMessage()
        return """
            <nav class="loculus-docs-bar" aria-label="API documentation navigation">
                <a href="${htmlEscape(backendConfig.websiteUrl)}">Loculus home</a>
                <label for="loculus-docs-spec">
                    API reference
                    <select id="loculus-docs-spec" data-mode="${mode.value}">
                        $options
                    </select>
                </label>
                $terms
            </nav>
        """.trimIndent()
    }

    /**
     * Resolve the requested spec URL against the allowlist of server-generated options. Anything else
     * (including attacker-crafted values that would otherwise be reflected into the docs page) falls back
     * to the default spec, so only known-safe URLs ever reach the rendered HTML.
     */
    private fun resolveSpecUrl(url: String): String =
        if (apiDocOptions().any { it.url == url }) url else DEFAULT_API_DOCS_URL

    private fun apiDocOptions(): List<ApiDocOption> {
        val configuredOptions = runCatching {
            val organismOptions = configService.listReleasedOrganisms().map { listing ->
                val organism = runCatching { configService.getOrganismConfig(listing.key).config }.getOrNull()
                val displayName = organism?.displayName ?: organism?.schema?.organismName ?: listing.key
                ApiDocOption("Organism: $displayName", "/api-docs/query/${listing.key}.json")
            }
            val viewOptions = configService.getInstanceConfig().config.configuredViews().map { (key, view) ->
                ApiDocOption("View: ${view.displayName}", "/api-docs/query/$key.json")
            }
            organismOptions + viewOptions
        }.getOrDefault(emptyList())

        return listOf(
            ApiDocOption("Complete API", DEFAULT_API_DOCS_URL),
            ApiDocOption("General backend API", "/api-docs/general.json"),
        ) + configuredOptions.sortedBy { it.label }
    }

    private fun dataUseTermsMessage(): String = runCatching {
        if (!configService.getInstanceConfig().config.dataUseTerms.enabled) {
            return@runCatching ""
        }
        """
            <span class="loculus-docs-terms">
                By using the API, you agree to the
                <a href="${htmlEscape(backendConfig.websiteUrl.trimEnd('/') + DATA_USE_TERMS_PATH)}">Data Use Terms</a>
            </span>
        """.trimIndent()
    }.getOrDefault("")

    @RequestMapping("/", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun jsonInfo() = Info(
        isInDebugMode = debugMode == DEBUG_MODE_ON_VALUE,
    )
}

data class Info(
    val name: String = "$PROJECT_NAME backend",
    val status: String = "Healthy",
    val documentation: String = "visit /swagger-ui/loculus or /scalar-api-reference",
    val isInDebugMode: Boolean,
)

private data class ApiDocOption(val label: String, val url: String)

private enum class ApiDocsMode(val value: String) {
    SWAGGER("swagger"),
    SCALAR("scalar"),
}

private fun htmlEscape(value: String): String = value
    .replace("&", "&amp;")
    .replace("<", "&lt;")
    .replace(">", "&gt;")
    .replace("\"", "&quot;")
    .replace("'", "&#39;")
