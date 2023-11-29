package org.pathoplexus.backend.controller

import io.jsonwebtoken.Jwts
import io.jsonwebtoken.SignatureAlgorithm
import io.jsonwebtoken.security.Keys
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder
import java.security.KeyPair
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Date

val keyPair: KeyPair = Keys.keyPairFor(SignatureAlgorithm.RS256)

val jwtForDefaultUser = generateJwtForUser(USER_NAME)

fun generateJwtForUser(username: String): String = Jwts.builder()
    .setExpiration(Date.from(Instant.now().plus(1, ChronoUnit.DAYS)))
    .setIssuedAt(Date.from(Instant.now()))
    .signWith(keyPair.private, SignatureAlgorithm.RS256)
    .claim("preferred_username", username)
    .compact()

fun MockHttpServletRequestBuilder.withAuth(bearerToken: String? = jwtForDefaultUser): MockHttpServletRequestBuilder =
    when (bearerToken) {
        null -> this
        else -> this.header("Authorization", "Bearer $bearerToken")
    }
