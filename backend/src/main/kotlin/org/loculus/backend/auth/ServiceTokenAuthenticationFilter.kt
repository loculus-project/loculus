package org.loculus.backend.auth

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import mu.KotlinLogging
import org.loculus.backend.auth.Roles.EXTERNAL_METADATA_UPDATER
import org.loculus.backend.auth.Roles.PREPROCESSING_PIPELINE
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.security.authentication.AbstractAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

private val log = KotlinLogging.logger {}

/**
 * Static service tokens for backend service accounts.
 *
 * Authelia's OIDC provider can't inject fixed `groups` claims into
 * `client_credentials` tokens (its claims_policies are anchored to the
 * authentication backend, which is empty in the service-to-service case),
 * so backend services authenticate with a pre-shared `X-Service-Token`
 * header instead of going through the IDP.
 *
 * Token values come from the existing `service-accounts` secret in the
 * Helm chart; each field is the raw token string for one well-known
 * automation account.
 */
@ConfigurationProperties(prefix = "loculus.service-tokens")
data class ServiceTokenProperties(
    val preprocessingPipeline: String? = null,
    val externalMetadataUpdater: String? = null,
    val insdcIngestUser: String? = null,
    val backend: String? = null,
)


class ServiceTokenAuthentication(
    private val name: String,
    authorities: Collection<SimpleGrantedAuthority>,
) : AbstractAuthenticationToken(authorities) {
    init {
        isAuthenticated = true
    }

    override fun getCredentials(): Any = ""
    override fun getPrincipal(): String = name
    override fun getName(): String = name
}


private data class ServiceAccount(val username: String, val roles: List<String>)


@Component
class ServiceTokenAuthenticationFilter(props: ServiceTokenProperties) : OncePerRequestFilter() {

    private val byToken: Map<String, ServiceAccount> = buildMap {
        listOfNotNull(
            props.preprocessingPipeline?.takeIf { it.isNotBlank() }?.let {
                it to ServiceAccount("preprocessing_pipeline", listOf(PREPROCESSING_PIPELINE, "user"))
            },
            props.externalMetadataUpdater?.takeIf { it.isNotBlank() }?.let {
                it to ServiceAccount(
                    "external_metadata_updater",
                    listOf(EXTERNAL_METADATA_UPDATER, "get_released_data", "user"),
                )
            },
            props.insdcIngestUser?.takeIf { it.isNotBlank() }?.let {
                it to ServiceAccount("insdc_ingest_user", listOf("user"))
            },
            props.backend?.takeIf { it.isNotBlank() }?.let {
                it to ServiceAccount("backend", listOf("user"))
            },
        ).forEach { (token, account) -> put(token, account) }
    }

    init {
        if (byToken.isNotEmpty()) {
            log.info { "Service-token authentication enabled for ${byToken.values.map { it.username }}" }
        } else {
            log.info { "No service tokens configured; service-to-service auth disabled" }
        }
    }

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        chain: FilterChain,
    ) {
        val token = request.getHeader(HEADER)
        if (!token.isNullOrBlank()) {
            val account = byToken[token]
            if (account != null) {
                SecurityContextHolder.getContext().authentication = ServiceTokenAuthentication(
                    account.username,
                    account.roles.map { SimpleGrantedAuthority(it) }.toSet(),
                )
            } else {
                log.debug { "Unrecognised value for $HEADER header" }
            }
        }
        chain.doFilter(request, response)
    }

    companion object {
        const val HEADER = "X-Service-Token"
    }
}
