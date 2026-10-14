package org.loculus.api.common.error

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
import org.springframework.web.context.request.WebRequest
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler

private val log = KotlinLogging.logger {}

/**
 * Every error response is an RFC 9457 problem detail (`application/problem+json`).
 */
@ControllerAdvice
class ExceptionHandler : ResponseEntityExceptionHandler() {

    @ExceptionHandler(ApiException::class)
    fun handleApiException(e: ApiException): ResponseEntity<ProblemDetail> {
        log.info { "Caught ${e.javaClass.simpleName}: ${e.message}" }
        return problem(e.status, e.message)
    }

    @ExceptionHandler(UnauthorizedException::class)
    fun handleUnauthorizedException(e: UnauthorizedException): ResponseEntity<ProblemDetail> {
        log.info { "Caught ${e.javaClass.simpleName}: ${e.message}" }
        return problem(e.status, e.message, HttpHeaders().apply { set(HttpHeaders.WWW_AUTHENTICATE, "Bearer") })
    }

    @ExceptionHandler(Throwable::class)
    fun handleUnexpectedException(e: Throwable): ResponseEntity<ProblemDetail> {
        log.error(e) { "Caught unexpected exception: ${e.message}" }
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, e.message)
    }

    override fun handleHttpMessageNotReadable(
        ex: HttpMessageNotReadableException,
        headers: HttpHeaders,
        status: HttpStatusCode,
        request: WebRequest,
    ): ResponseEntity<Any>? {
        log.info { "Caught ${ex.javaClass.simpleName}: ${ex.message}" }
        val body = createProblemDetail(ex, status, ex.message ?: "Failed to read request", null, null, request)
        return handleExceptionInternal(ex, body, headers, status, request)
    }

    private fun problem(
        status: HttpStatus,
        detail: String?,
        headers: HttpHeaders = HttpHeaders(),
    ): ResponseEntity<ProblemDetail> = ResponseEntity
        .status(status)
        .headers(headers)
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(
            ProblemDetail.forStatus(status).also {
                it.title = status.reasonPhrase
                it.detail = detail
            },
        )
}

sealed class ApiException(val status: HttpStatus, override val message: String) : RuntimeException(message)

class UnauthorizedException(message: String) : ApiException(HttpStatus.UNAUTHORIZED, message)
class ForbiddenException(message: String) : ApiException(HttpStatus.FORBIDDEN, message)
class NotFoundException(message: String) : ApiException(HttpStatus.NOT_FOUND, message)
class ConflictException(message: String) : ApiException(HttpStatus.CONFLICT, message)
class ServiceUnavailableException(message: String) : ApiException(HttpStatus.SERVICE_UNAVAILABLE, message)
