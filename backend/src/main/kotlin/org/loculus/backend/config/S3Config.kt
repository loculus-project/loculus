package org.loculus.backend.config

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import java.net.URI
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty

@Configuration
@ConfigurationProperties(prefix = "loculus.s3")
class S3Config {
    var enabled: Boolean = false
    var endpoint: String? = null
    var region: String = "us-east-1"
    var bucket: String = ""
    var accessKey: String? = null
    var secretKey: String? = null
    var presignedUrlExpirationSeconds: Long = 3600

    @Bean
    @ConditionalOnProperty(name = ["loculus.s3.enabled"], havingValue = "true")
    fun s3Client(): S3Client {
        val builder = S3Client.builder()
            .region(Region.of(region))

        // Use custom endpoint if specified (for MinIO, etc.)
        if (!endpoint.isNullOrBlank()) {
            builder.endpointOverride(URI.create(endpoint))
        }

        // Use credentials if provided
        if (!accessKey.isNullOrBlank() && !secretKey.isNullOrBlank()) {
            val awsCredentials = AwsBasicCredentials.create(accessKey, secretKey)
            builder.credentialsProvider(StaticCredentialsProvider.create(awsCredentials))
        }

        return builder.build()
    }

    @Bean
    @ConditionalOnProperty(name = ["loculus.s3.enabled"], havingValue = "true")
    fun s3Presigner(): S3Presigner {
        val builder = S3Presigner.builder()
            .region(Region.of(region))

        // Use custom endpoint if specified (for MinIO, etc.)
        if (!endpoint.isNullOrBlank()) {
            builder.endpointOverride(URI.create(endpoint))
        }

        // Use credentials if provided
        if (!accessKey.isNullOrBlank() && !secretKey.isNullOrBlank()) {
            val awsCredentials = AwsBasicCredentials.create(accessKey, secretKey)
            builder.credentialsProvider(StaticCredentialsProvider.create(awsCredentials))
        }

        return builder.build()
    }
}