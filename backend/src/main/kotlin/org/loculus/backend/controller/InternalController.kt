package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.headers.Header
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
import mu.KotlinLogging
import org.loculus.backend.api.CompressionFormat
import org.loculus.backend.api.ExternalSubmittedData
import org.loculus.backend.api.Organism
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.SubmittedProcessedData
import org.loculus.backend.api.UnprocessedData
import org.loculus.backend.controller.LoculusCustomHeaders.X_TOTAL_RECORDS
import org.loculus.backend.log.RequestIdContext
import org.loculus.backend.model.RELEASED_DATA_RELATED_TABLES
import org.loculus.backend.model.ReleasedDataModel
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.loculus.backend.utils.IteratorStreamer
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import io.swagger.v3.oas.annotations.parameters.RequestBody as SwaggerRequestBody

private val log = KotlinLogging.logger { }

@RestController
@RequestMapping("/{organism}")
@Validated
@SecurityRequirement(name = "bearerAuth")
open class InternalController(
    private val releasedDataModel: ReleasedDataModel,
    private val submissionDatabaseService: SubmissionDatabaseService,
    iteratorStreamer: IteratorStreamer,
    requestIdContext: RequestIdContext,
) : BaseController(iteratorStreamer, requestIdContext) {
    @Operation(description = EXTRACT_UNPROCESSED_DATA_DESCRIPTION)
    @ApiResponse(
        responseCode = "200",
        description = EXTRACT_UNPROCESSED_DATA_RESPONSE_DESCRIPTION,
        content = [
            Content(
                schema = Schema(implementation = UnprocessedData::class),
            ),
        ],
        headers = [
            Header(
                name = "eTag",
                description = "Last database write Etag",
                schema = Schema(type = "integer"),
            ),
        ],
    )
    @ApiResponse(
        responseCode = "304",
        description =
        "No database changes since last request " +
            "(Etag in HttpHeaders.IF_NONE_MATCH matches lastDatabaseWriteETag)",
    )
    @ApiResponse(responseCode = "422", description = EXTRACT_UNPROCESSED_DATA_ERROR_RESPONSE)
    @PostMapping("/extract-unprocessed-data", produces = [MediaType.APPLICATION_NDJSON_VALUE])
    fun extractUnprocessedData(
        @PathVariable @Valid organism: Organism,
        @RequestParam @Max(
            value = MAX_EXTRACTED_SEQUENCE_ENTRIES,
            message = "You can extract at max $MAX_EXTRACTED_SEQUENCE_ENTRIES sequence entries at once.",
        ) numberOfSequenceEntries: Int,
        @RequestParam pipelineVersion: Long,
        @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) ifNoneMatch: String?,
    ): ResponseEntity<StreamingResponseBody> {
        val currentProcessingPipelineVersion = submissionDatabaseService.getCurrentProcessingPipelineVersion(organism)
        if (pipelineVersion < currentProcessingPipelineVersion) {
            throw UnprocessableEntityException(
                "The processing pipeline version $pipelineVersion is not accepted " +
                    "anymore. The current pipeline version is $currentProcessingPipelineVersion.",
            )
        }

        val lastDatabaseWriteETag = releasedDataModel.getLastDatabaseWriteETag()
        if (ifNoneMatch == lastDatabaseWriteETag) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).build()
        }

        val headers = HttpHeaders()
        headers.contentType = MediaType.parseMediaType(MediaType.APPLICATION_NDJSON_VALUE)
        headers.eTag = lastDatabaseWriteETag
        val streamBody = streamTransactioned(
            endpoint = "extract-unprocessed-data",
            organism = organism,
        ) {
            submissionDatabaseService.streamUnprocessedSubmissions(numberOfSequenceEntries, organism, pipelineVersion)
        }
        return ResponseEntity(streamBody, headers, HttpStatus.OK)
    }

    @Operation(
        description = SUBMIT_PROCESSED_DATA_DESCRIPTION,
        requestBody = SwaggerRequestBody(
            content = [
                Content(
                    mediaType = MediaType.APPLICATION_NDJSON_VALUE,
                    schema = Schema(implementation = SubmittedProcessedData::class),
                ),
            ],
        ),
        parameters = [
            Parameter(
                name = "pipelineVersion",
                description = "Version of the processing pipeline",
                required = true,
                schema = Schema(implementation = Int::class),
            ),
        ],
    )
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @ApiResponse(responseCode = "400", description = "On invalid NDJSON line. Rolls back the whole transaction.")
    @ApiResponse(responseCode = "422", description = SUBMIT_PROCESSED_DATA_ERROR_RESPONSE_DESCRIPTION)
    @PostMapping("/submit-processed-data", consumes = [MediaType.APPLICATION_NDJSON_VALUE])
    fun submitProcessedData(
        @PathVariable @Valid organism: Organism,
        @RequestParam pipelineVersion: Long,
        request: HttpServletRequest,
    ) = submissionDatabaseService.updateProcessedData(request.inputStream, organism, pipelineVersion)

    @Operation(
        description = SUBMIT_EXTERNAL_METADATA_DESCRIPTION,
        requestBody = SwaggerRequestBody(
            content = [
                Content(
                    mediaType = MediaType.APPLICATION_NDJSON_VALUE,
                    schema = Schema(
                        implementation = ExternalSubmittedData::class,
                    ),
                ),
            ],
        ),
    )
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @ApiResponse(
        responseCode = "400",
        description = "On invalid NDJSON line. Rolls back the whole transaction.",
    )
    @ApiResponse(
        responseCode = "422",
        description = SUBMIT_EXTERNAL_METADATA_ERROR_RESPONSE_DESCRIPTION,
    )
    @PostMapping("/submit-external-metadata", consumes = [MediaType.APPLICATION_NDJSON_VALUE])
    fun submitExternalMetadata(
        @PathVariable @Valid organism: Organism,
        @Parameter(
            description = (
                "Name of the pipeline submitting the external metadata update. This should match the " +
                    "externalMetadataUpdater value of the externalMetadata fields (in the backend_config.json) that are being updated."
                ),
        ) @RequestParam externalMetadataUpdater: String,
        request: HttpServletRequest,
    ) {
        submissionDatabaseService.updateExternalMetadata(
            request.inputStream,
            organism,
            externalMetadataUpdater,
        )
    }

    @Operation(description = GET_RELEASED_DATA_DESCRIPTION)
    @ResponseStatus(HttpStatus.OK)
    @ApiResponse(
        responseCode = "200",
        description = GET_RELEASED_DATA_RESPONSE_DESCRIPTION,
        content = [
            Content(
                schema = Schema(implementation = ProcessedData::class),
            ),
        ],
        headers = [
            Header(
                name = X_TOTAL_RECORDS,
                description = "The total number of records sent in responseBody",
                schema = Schema(type = "integer"),
            ),
            Header(
                name = "eTag",
                description = "Last database write Etag",
                schema = Schema(type = "integer"),
            ),
        ],
    )
    @ApiResponse(
        responseCode = "304",
        description =
        "No database changes since last request " +
            "(Etag in HttpHeaders.IF_NONE_MATCH matches lastDatabaseWriteETag)",
    )
    @GetMapping("/get-released-data", produces = [MediaType.APPLICATION_NDJSON_VALUE])
    fun getReleasedData(
        @PathVariable @Valid organism: Organism,
        @RequestParam compression: CompressionFormat?,
        @Parameter(
            description = "(Optional) Only retrieve all released data if Etag has changed.",
        ) @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) ifNoneMatch: String?,
    ): ResponseEntity<StreamingResponseBody> {
        val lastDatabaseWriteETag = releasedDataModel.getLastDatabaseWriteETag(
            RELEASED_DATA_RELATED_TABLES,
        )
        if (ifNoneMatch == lastDatabaseWriteETag) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).build()
        }

        val headers = HttpHeaders()
        headers.eTag = lastDatabaseWriteETag
        headers.contentType = MediaType.APPLICATION_NDJSON
        compression?.let { headers.add(HttpHeaders.CONTENT_ENCODING, it.compressionName) }

        val totalRecords = submissionDatabaseService.countReleasedSubmissions(organism)
        headers.add(X_TOTAL_RECORDS, totalRecords.toString())
        // TODO(https://github.com/loculus-project/loculus/issues/2778)
        // There's a possibility that the totalRecords change between the count and the actual query
        // this is not too bad, if the client ends up with a few more records than expected
        // We just need to make sure the etag used is from before the count
        // Alternatively, we could read once to file while counting and then stream the file

        val streamBody = streamTransactioned(
            compression,
            endpoint = "get-released-data",
            organism = organism,
        ) {
            releasedDataModel.getReleasedData(organism)
        }
        return ResponseEntity.ok().headers(headers).body(streamBody)
    }
}
