package org.loculus.backend.testutil

import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.security.oauth2.jwt.JwtValidators
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder
import java.security.interfaces.RSAPublicKey

@TestConfiguration
class PublicJwtKeyConfig {
    @Bean
    fun jwtDecoder(
        @Value("\${spring.security.oauth2.resourceserver.jwt.issuer-uri}") issuer: String,
    ): NimbusJwtDecoder = NimbusJwtDecoder.withPublicKey(keyPair.public as RSAPublicKey).build().apply {
        setJwtValidator(JwtValidators.createDefaultWithIssuer(issuer))
    }
}
