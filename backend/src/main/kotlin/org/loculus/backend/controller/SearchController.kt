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
            "Each entry in 'accessionOrAccessionVersions' is parsed: if it ends with '.<number>' it is treated as a " +
            "specific accession version (e.g. 'LOC_000S01D.1'); otherwise it is treated as a bare accession " +
            "and all released versions for that accession are returned. " +
            "At least one value must be provided.",
    )
    @ApiResponse(responseCode = "200", description = "NDJSON stream of sequence entry versions")
    @ApiResponse(
        responseCode = "400",
        description = "No accessionOrAccessionVersions provided",
    )
    @GetMapping("/get-details", produces = [MediaType.APPLICATION_NDJSON_VALUE])
    fun getDetails(
        @RequestParam(required = false) accessionOrAccessionVersions: List<String>?,
    ): ResponseEntity<StreamingResponseBody> {
        val normalized = accessionOrAccessionVersions?.takeIf { it.isNotEmpty() }
            ?: throw BadRequestException("At least one accession or accession version must be provided.")

        val parsed = normalized.map { parseAccessionOrVersion(it) }
        val bareAccessions = parsed.filterIsInstance<ParsedAccessionEntry.BareAccession>().map { it.accession }
        val versionedAccessions = parsed.filterIsInstance<ParsedAccessionEntry.Versioned>().map { it.accessionVersion }

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
                                bareAccessions,
                                versionedAccessions,
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

    private sealed class ParsedAccessionEntry {
        data class BareAccession(val accession: Accession) : ParsedAccessionEntry()
        data class Versioned(val accessionVersion: AccessionVersion) : ParsedAccessionEntry()
    }

    private fun parseAccessionOrVersion(input: String): ParsedAccessionEntry {
        val lastDotIndex = input.lastIndexOf('.')
        if (lastDotIndex != -1 && lastDotIndex < input.length - 1) {
            val versionStr = input.substring(lastDotIndex + 1)
            val version = versionStr.toLongOrNull()
            if (version != null) {
                val accession = input.substring(0, lastDotIndex)
                return ParsedAccessionEntry.Versioned(AccessionVersion(accession, version))
            }
        }
        return ParsedAccessionEntry.BareAccession(input)
    }
}
