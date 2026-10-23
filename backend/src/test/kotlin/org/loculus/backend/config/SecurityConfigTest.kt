package org.loculus.backend.config

import com.nimbusds.jose.jwk.JWKSet
import com.nimbusds.jose.jwk.RSAKey
import com.sun.net.httpserver.HttpServer
import io.jsonwebtoken.Jwts
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.controller.TEST_TOKEN_ISSUER
import org.loculus.backend.controller.keyPair
import org.springframework.boot.autoconfigure.AutoConfigurations
import org.springframework.boot.security.oauth2.server.resource.autoconfigure.OAuth2ResourceServerAutoConfiguration
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.security.oauth2.jwt.JwtException
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException
import java.net.InetSocketAddress
import java.security.KeyPair
import java.security.interfaces.RSAPublicKey
import java.time.Instant
import java.util.Date

class SecurityConfigTest {
    private val propertyPrefix = "spring.security.oauth2.resourceserver.jwt"

    @Test
    fun `startup rejects missing or blank issuer configuration`() {
        for (issuer in listOf(null, "", "   ")) {
            var context = ApplicationContextRunner()
                .withUserConfiguration(JwtConfigIsPresentGuard::class.java)
                .withPropertyValues("$propertyPrefix.jwk-set-uri=http://internal.example/certs")
            if (issuer != null) context = context.withPropertyValues("$propertyPrefix.issuer-uri=$issuer")
            context.run { assertMissingProperty(it.startupFailure, "$propertyPrefix.issuer-uri") }
        }
    }

    @Test
    fun `startup still requires a signing key URL`() {
        ApplicationContextRunner()
            .withUserConfiguration(JwtConfigIsPresentGuard::class.java)
            .withPropertyValues("$propertyPrefix.issuer-uri=$TEST_TOKEN_ISSUER")
            .run { assertMissingProperty(it.startupFailure, "$propertyPrefix.jwk-set-uri") }
    }

    @Test
    fun `Boot decoder validates issuer signature and timestamps using a separate JWKS endpoint`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val keys = JWKSet(RSAKey.Builder(keyPair.public as RSAPublicKey).build()).toString().toByteArray()
        server.createContext("/certs") { exchange ->
            exchange.responseHeaders.set("Content-Type", "application/json")
            exchange.sendResponseHeaders(200, keys.size.toLong())
            exchange.responseBody.use { it.write(keys) }
        }
        server.start()
        try {
            ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(OAuth2ResourceServerAutoConfiguration::class.java))
                .withUserConfiguration(JwtConfigIsPresentGuard::class.java)
                .withPropertyValues(
                    "$propertyPrefix.issuer-uri=$TEST_TOKEN_ISSUER",
                    "$propertyPrefix.jwk-set-uri=http://127.0.0.1:${server.address.port}/certs",
                )
                .run { context ->
                    assertNull(context.startupFailure)
                    val decoder = context.getBean(JwtDecoder::class.java)
                    val validToken = decoder.decode(token())
                    assertEquals(TEST_TOKEN_ISSUER, validToken.issuer.toString())
                    val converter = KeycloakAuthenticationConverter(KeycloakAuthoritiesConverter())
                    val authentication = converter.convert(validToken)
                    assertEquals("testuser", authentication.name)
                    assertEquals(listOf("preprocessing_pipeline"), authentication.authorities.map { it.authority })
                    assertThrows<InvalidBearerTokenException> {
                        converter.convert(decoder.decode(token(username = null)))
                    }
                    for (issuer in listOf(null, "https://other.example/realms/loculus", "$TEST_TOKEN_ISSUER/")) {
                        assertThrows<JwtException> { decoder.decode(token(issuer = issuer)) }
                    }
                    assertThrows<JwtException> {
                        decoder.decode(token(expiration = Instant.now().minusSeconds(300)))
                    }
                    assertThrows<JwtException> {
                        decoder.decode(token(notBefore = Instant.now().plusSeconds(300)))
                    }
                    assertThrows<JwtException> { decoder.decode(token(signingKey = Jwts.SIG.RS256.keyPair().build())) }
                }
        } finally {
            server.stop(0)
        }
    }

    private fun assertMissingProperty(failure: Throwable?, property: String) {
        assertNotNull(failure)
        assertTrue(
            generateSequence(failure) { it.cause }.any {
                it is IllegalStateException && it.message?.startsWith("Missing required property '$property'.") == true
            },
            "Expected startup to fail because '$property' is missing; got $failure",
        )
    }

    private fun token(
        issuer: String? = TEST_TOKEN_ISSUER,
        expiration: Instant = Instant.now().plusSeconds(600),
        notBefore: Instant = Instant.now().minusSeconds(600),
        signingKey: KeyPair = keyPair,
        username: String? = "testuser",
    ): String = Jwts.builder()
        .apply { if (issuer != null) issuer(issuer) }
        .issuedAt(Date.from(Instant.now().minusSeconds(600)))
        .notBefore(Date.from(notBefore))
        .expiration(Date.from(expiration))
        // Current Keycloak access tokens may have only this audience; this PR must not reject it.
        .claim("aud", "account")
        .apply { if (username != null) claim("preferred_username", username) }
        .claim("realm_access", mapOf("roles" to listOf("preprocessing_pipeline")))
        .signWith(signingKey.private, Jwts.SIG.RS256)
        .compact()
}
