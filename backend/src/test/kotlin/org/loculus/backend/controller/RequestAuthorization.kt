package org.loculus.backend.controller

import io.jsonwebtoken.Jwts
import org.loculus.backend.auth.Roles.EXTERNAL_METADATA_UPDATER
import org.loculus.backend.auth.Roles.GET_RELEASED_DATA
import org.loculus.backend.auth.Roles.PREPROCESSING_PIPELINE
import org.loculus.backend.auth.Roles.SUPER_USER
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
import java.security.KeyPair
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Date

val keyPair: KeyPair = Jwts.SIG.RS256.keyPair().build()

val jwtForDefaultUser = generateJwtFor(DEFAULT_USER_NAME)
val jwtForProcessingPipeline = generateJwtFor("preprocessing_pipeline", listOf(PREPROCESSING_PIPELINE))
val jwtForGetReleasedData = generateJwtFor("silo_import_job", listOf(GET_RELEASED_DATA, EXTERNAL_METADATA_UPDATER))
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

fun MockHttpServletRequestBuilder.withAuth(bearerToken: String? = jwtForDefaultUser): MockHttpServletRequestBuilder =
    when (bearerToken) {
        null -> this
        else -> this.header("Authorization", "Bearer $bearerToken")
    }
