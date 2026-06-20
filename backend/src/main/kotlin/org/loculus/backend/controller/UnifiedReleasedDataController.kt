package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import mu.KotlinLogging
import org.apache.commons.compress.compressors.zstandard.ZstdCompressorOutputStream
import org.jetbrains.exposed.sql.transactions.transaction
import org.loculus.backend.api.CompressionFormat
import org.loculus.backend.api.Organism
import org.loculus.backend.controller.LoculusCustomHeaders.X_TOTAL_RECORDS
import org.loculus.backend.log.REQUEST_ID_MDC_KEY
import org.loculus.backend.log.RequestIdContext
import org.loculus.backend.model.RELEASED_DATA_RELATED_TABLES
import org.loculus.backend.model.ReleasedDataModel
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.loculus.backend.utils.IteratorStreamer
import org.slf4j.MDC
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody

private val log = KotlinLogging.logger { }

@RestController
@PreAuthorize("permitAll()")
@SecurityRequirement(name = "bearerAuth")
class UnifiedReleasedDataController(
    private val releasedDataModel: ReleasedDataModel,
    private val submissionDatabaseService: SubmissionDatabaseService,
    private val iteratorStreamer: IteratorStreamer,
    private val requestIdContext: RequestIdContext,
) {
    @GetMapping("/get-released-data", produces = [MediaType.APPLICATION_NDJSON_VALUE])
    fun getAllReleasedData(
        @RequestParam compression: CompressionFormat?,
        @RequestParam(required = false) organism: String?,
        @Parameter(
            description = "(Optional) Only retrieve all released data if Etag has changed.",
        ) @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) ifNoneMatch: String?,
    ): ResponseEntity<StreamingResponseBody> {
        val organismFilter = organism?.let { Organism(it) }
        val lastDatabaseWriteETag = releasedDataModel.getLastDatabaseWriteETag(
            tableNames = RELEASED_DATA_RELATED_TABLES,
            organism = organismFilter,
        )
        if (ifNoneMatch == lastDatabaseWriteETag) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).build()
        }

        val headers = HttpHeaders()
        headers.eTag = lastDatabaseWriteETag
        headers.contentType = MediaType.APPLICATION_NDJSON
        compression?.let { headers.add(HttpHeaders.CONTENT_ENCODING, it.compressionName) }

        val totalRecords = if (organismFilter != null) {
            submissionDatabaseService.countReleasedSubmissions(organismFilter)
        } else {
            submissionDatabaseService.countAllReleasedSubmissions()
        }
        headers.add(X_TOTAL_RECORDS, totalRecords.toString())

        val streamBody = StreamingResponseBody { responseBodyStream ->
            MDC.put(REQUEST_ID_MDC_KEY, requestIdContext.requestId)
            val outputStream = when (compression) {
                CompressionFormat.ZSTD -> ZstdCompressorOutputStream(responseBodyStream)
                null -> responseBodyStream
            }
            outputStream.use { stream ->
                transaction {
                    try {
                        val data = if (organismFilter != null) {
                            releasedDataModel.getReleasedData(organismFilter)
                        } else {
                            releasedDataModel.getAllReleasedData()
                        }
                        iteratorStreamer.streamAsNdjson(data, stream)
                    } catch (e: Exception) {
                        log.error(e) { "[get-released-data] Unexpected error while streaming: $e" }
                        stream.write(
                            "An unexpected error occurred while streaming: ${e.message}".toByteArray(),
                        )
                    }
                }
            }
            MDC.remove(REQUEST_ID_MDC_KEY)
        }

        return ResponseEntity.ok().headers(headers).body(streamBody)
    }
}
