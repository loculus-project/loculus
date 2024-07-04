package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.headers.Header
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import jakarta.validation.ConstraintViolationException
import mu.KotlinLogging
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.HttpStatusCode
import org.springframework.http.MediaType
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.annotation.ControllerAdvice
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.context.request.WebRequest
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler

private val log = KotlinLogging.logger {}

@ControllerAdvice
class ExceptionHandler : ResponseEntityExceptionHandler() {

    @ExceptionHandler(Throwable::class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    fun handleUnexpectedException(e: Throwable): ResponseEntity<ProblemDetail> {
        log.error(e) { "Caught unexpected exception: ${e.message}" }

        return responseEntity(
            HttpStatus.INTERNAL_SERVER_ERROR,
            e.message,
        )
    }

    @ExceptionHandler(ConstraintViolationException::class, BadRequestException::class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    fun handleBadRequestException(e: Exception): ResponseEntity<ProblemDetail> {
        log.info { "Caught ${e.javaClass}: ${e.message}" }

        return responseEntity(
            HttpStatus.BAD_REQUEST,
            e.message,
        )
    }

    @ExceptionHandler(DummyUnauthorizedExceptionToMakeItAppearInSwaggerUi::class)
    @ApiResponse(
        responseCode = "401",
        headers = [
            Header(
                name = "WWW-Authenticate",
                description = "Error information",
                schema = Schema(type = "string"),
            ),
        ],
    )
    fun handleUnauthorizedException(e: Exception): ResponseEntity<Void> {
        log.info { "Caught ${e.javaClass}: ${e.message}" }

        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build()
    }

    @ExceptionHandler(
        UnprocessableEntityException::class,
        ProcessingValidationException::class,
        DuplicateKeyException::class,
    )
    @ResponseStatus(HttpStatus.UNPROCESSABLE_ENTITY)
    fun handleUnprocessableEntityException(e: Exception): ResponseEntity<ProblemDetail> {
        log.info { "Caught unprocessable entity exception: ${e.message}" }

        return responseEntity(
            HttpStatus.UNPROCESSABLE_ENTITY,
            e.message,
        )
    }

    @ExceptionHandler(ConflictException::class)
    @ResponseStatus(HttpStatus.CONFLICT)
    fun handleConflictException(e: Exception): ResponseEntity<ProblemDetail> {
        log.info { "Caught conflict exception: ${e.message}" }

        return responseEntity(
            HttpStatus.CONFLICT,
            e.message,
        )
    }

    @ExceptionHandler(NotFoundException::class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    fun handleNotFoundException(e: NotFoundException): ResponseEntity<ProblemDetail> {
        log.info { "Caught not found exception: ${e.message}" }

        return responseEntity(
            HttpStatus.NOT_FOUND,
            e.message,
        )
    }

    @ExceptionHandler(ForbiddenException::class)
    @ResponseStatus(HttpStatus.FORBIDDEN)
    fun handleForbiddenException(e: ForbiddenException): ResponseEntity<ProblemDetail> {
        log.info { "Caught forbidden exception: ${e.message}" }

        return responseEntity(
            HttpStatus.FORBIDDEN,
            e.message,
        )
    }

    private fun responseEntity(httpStatus: HttpStatus, detail: String?): ResponseEntity<ProblemDetail> =
        responseEntity(httpStatus, httpStatus.reasonPhrase, detail)

    private fun responseEntity(
        httpStatus: HttpStatusCode,
        title: String,
        detail: String?,
    ): ResponseEntity<ProblemDetail> = ResponseEntity
        .status(httpStatus)
        .contentType(MediaType.APPLICATION_JSON)
        .body(
            ProblemDetail.forStatus(httpStatus).also {
                it.title = title
                it.detail = detail
            },
        )

    override fun createProblemDetail(
        ex: java.lang.Exception,
        status: HttpStatusCode,
        defaultDetail: String,
        detailMessageCode: String?,
        detailMessageArguments: Array<out Any>?,
        request: WebRequest,
    ): ProblemDetail {
        log.warn { "Caught ${ex.javaClass}: ${ex.message}" }

        return super.createProblemDetail(ex, status, defaultDetail, detailMessageCode, detailMessageArguments, request)
    }

    override fun handleHttpMessageNotReadable(
        ex: HttpMessageNotReadableException,
        headers: HttpHeaders,
        status: HttpStatusCode,
        request: WebRequest,
    ): ResponseEntity<Any>? {
        val body = createProblemDetail(ex, status, ex.message ?: "Failed to read request", null, null, request)
        return handleExceptionInternal(ex, body, headers, status, request)
    }
}

class BadRequestException(message: String, override val cause: Throwable? = null) : RuntimeException(message)
class ForbiddenException(message: String) : RuntimeException(message)
class UnprocessableEntityException(message: String) : RuntimeException(message)
class NotFoundException(message: String) : RuntimeException(message)
class ProcessingValidationException(message: String) : RuntimeException(message)
class DuplicateKeyException(message: String) : RuntimeException(message)
class ConflictException(message: String) : RuntimeException(message)
class DummyUnauthorizedExceptionToMakeItAppearInSwaggerUi : RuntimeException()
