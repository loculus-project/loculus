package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.responses.ApiResponse
import mu.KotlinLogging
import org.jetbrains.exposed.sql.transactions.transaction
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.log.REQUEST_ID_MDC_KEY
import org.loculus.backend.log.RequestIdContext
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.IteratorStreamer
import org.slf4j.MDC
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody

private val log = KotlinLogging.logger { }

@RestController
@Validated
class SearchController(
    private val submissionDatabaseService: SubmissionDatabaseService,
    private val iteratorStreamer: IteratorStreamer,
    private val requestIdContext: RequestIdContext,
) {
    @Operation(
        description = "Given a list of accessions or accession versions, return an NDJSON stream of the " +
            "corresponding released entries from the sequence entries view. " +
            "For bare accessions (without version), all released versions are returned. " +
            "For accession versions (e.g. 'LOC_000S01D.1'), only that specific version is returned. " +
            "At least one of 'accessions' or 'accessionVersions' must be provided.",
    )
    @ApiResponse(responseCode = "200", description = "NDJSON stream of sequence entry versions")
    @ApiResponse(
        responseCode = "400",
        description = "Neither accessions nor accessionVersions provided, or invalid format",
    )
    @GetMapping("/get-details", produces = [MediaType.APPLICATION_NDJSON_VALUE])
    fun getDetails(
        @RequestParam(required = false) accessions: List<Accession>?,
        @RequestParam(required = false) accessionVersions: List<String>?,
    ): ResponseEntity<StreamingResponseBody> {
        val normalizedAccessions = accessions?.takeIf { it.isNotEmpty() } ?: emptyList()
        val normalizedAccessionVersions = accessionVersions?.takeIf { it.isNotEmpty() } ?: emptyList()

        if (normalizedAccessions.isEmpty() && normalizedAccessionVersions.isEmpty()) {
            throw BadRequestException("At least one of 'accessions' or 'accessionVersions' must be provided.")
        }

        val parsedAccessionVersions = normalizedAccessionVersions.map { parseAccessionVersion(it) }

        val headers = org.springframework.http.HttpHeaders()
        headers.contentType = MediaType.parseMediaType(MediaType.APPLICATION_NDJSON_VALUE)

        val streamBody = StreamingResponseBody { responseBodyStream ->
            val startTime = System.currentTimeMillis()
            MDC.put(REQUEST_ID_MDC_KEY, requestIdContext.requestId)

            responseBodyStream.use { stream ->
                transaction {
                    try {
                        iteratorStreamer.streamAsNdjson(
                            submissionDatabaseService.streamDetailsForAccessions(
                                normalizedAccessions,
                                parsedAccessionVersions,
                            ),
                            stream,
                        )
                    } catch (e: Exception) {
                        val duration = System.currentTimeMillis() - startTime
                        log.error(e) {
                            "[get-details] An unexpected error occurred while streaming after " +
                                "${duration}ms, aborting: $e"
                        }
                        stream.write(
                            "An unexpected error occurred while streaming: ${e.message}".toByteArray(),
                        )
                    }
                }
            }

            val duration = System.currentTimeMillis() - startTime
            log.info { "[get-details] Streaming response completed in ${duration}ms" }

            MDC.remove(REQUEST_ID_MDC_KEY)
        }

        return ResponseEntity.ok().headers(headers).body(streamBody)
    }

    private fun parseAccessionVersion(accessionVersion: String): AccessionVersion {
        val lastDotIndex = accessionVersion.lastIndexOf('.')
        if (lastDotIndex == -1 || lastDotIndex == accessionVersion.length - 1) {
            throw BadRequestException(
                "Invalid accession version format '$accessionVersion'. Expected format: '<accession>.<version>'",
            )
        }
        val accession = accessionVersion.substring(0, lastDotIndex)
        val versionStr = accessionVersion.substring(lastDotIndex + 1)
        val version = versionStr.toLongOrNull()
            ?: throw BadRequestException(
                "Invalid version '$versionStr' in accession version '$accessionVersion'. Version must be a number.",
            )
        return AccessionVersion(accession, version)
    }
}
