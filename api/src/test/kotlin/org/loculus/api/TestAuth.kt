package org.loculus.api

import io.jsonwebtoken.Jwts
import org.loculus.api.auth.Roles
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder
import java.security.KeyPair
import java.security.interfaces.RSAPublicKey
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Date

const val DEFAULT_USER_NAME = "testuser"
const val ALTERNATIVE_USER_NAME = "testuser2"
const val SUPER_USER_NAME = "test_superuser"

private val keyPair: KeyPair = Jwts.SIG.RS256.keyPair().build()

val jwtForDefaultUser = generateJwtFor(DEFAULT_USER_NAME)
val jwtForAlternativeUser = generateJwtFor(ALTERNATIVE_USER_NAME)
val jwtForSuperUser = generateJwtFor(SUPER_USER_NAME, listOf(Roles.SUPER_USER))

fun generateJwtFor(username: String?, roles: List<String> = emptyList()): String = Jwts.builder()
    .expiration(Date.from(Instant.now().plus(1, ChronoUnit.DAYS)))
    .issuedAt(Date.from(Instant.now()))
    .signWith(keyPair.private, Jwts.SIG.RS256)
    .apply { if (username != null) claim("preferred_username", username) }
    .claim("realm_access", mapOf("roles" to roles))
    .compact()

fun <B : AbstractMockHttpServletRequestBuilder<B>> B.withAuth(jwt: String?): B = when (jwt) {
    null -> this
    else -> header("Authorization", "Bearer $jwt")
}

@TestConfiguration
class TestJwtDecoderConfig {
    @Bean
    fun jwtDecoder(): NimbusJwtDecoder = NimbusJwtDecoder.withPublicKey(keyPair.public as RSAPublicKey).build()
}
