package org.loculus.backend.controller

import io.jsonwebtoken.Jwts
import org.loculus.backend.auth.Roles.EXTERNAL_METADATA_UPDATER
import org.loculus.backend.auth.Roles.PREPROCESSING_PIPELINE
import org.loculus.backend.auth.Roles.SUPER_USER
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder
import java.security.KeyPair
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Date

val keyPair: KeyPair = Jwts.SIG.RS256.keyPair().build()

val jwtForDefaultUser = generateJwtFor(DEFAULT_USER_NAME)
val jwtForAlternativeUser = generateJwtFor(ALTERNATIVE_DEFAULT_USER_NAME)
val jwtForProcessingPipeline = generateJwtFor("preprocessing_pipeline", listOf(PREPROCESSING_PIPELINE))
val jwtForExternalMetadataUpdatePipeline =
    generateJwtFor("external_metadata_updater", listOf(EXTERNAL_METADATA_UPDATER))
val jwtForSuperUser = generateJwtFor(SUPER_USER_NAME, listOf(SUPER_USER))

fun generateJwtFor(username: String, roles: List<String> = emptyList()): String = Jwts.builder()
    .expiration(Date.from(Instant.now().plus(1, ChronoUnit.DAYS)))
    .issuedAt(Date.from(Instant.now()))
    .signWith(keyPair.private, Jwts.SIG.RS256)
    .claim("preferred_username", username)
    .claim("realm_access", mapOf("roles" to roles))
    .compact()

fun <B : AbstractMockHttpServletRequestBuilder<B>> B.withAuth(bearerToken: String? = jwtForDefaultUser): B =
    when (bearerToken) {
        null -> this
        else -> this.header("Authorization", "Bearer $bearerToken")
    }

/**
 * Adds a query parameter only when [value] is non-null. Spring Test 7's `param()` rejects null
 * (JSpecify null-safety); omitting an absent optional filter is equivalent to passing null in Spring 6.
 */
fun <B : AbstractMockHttpServletRequestBuilder<B>> B.paramIfPresent(name: String, value: String?): B =
    if (value != null) param(name, value) else this
