package org.pathoplexus.backend.controller

import mu.KotlinLogging
import org.pathoplexus.backend.model.InvalidSequenceFileException
import org.springframework.http.HttpStatus
import org.springframework.http.HttpStatusCode
import org.springframework.http.MediaType
import org.springframework.http.ProblemDetail
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ControllerAdvice
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.ResponseStatus
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

    @ExceptionHandler(InvalidSequenceFileException::class)
    @ResponseStatus(HttpStatus.UNPROCESSABLE_ENTITY)
    fun handleIllegalArgumentException(e: InvalidSequenceFileException): ResponseEntity<ProblemDetail> {
        log.error(e) { "Caught InvalidSequenceFileException: ${e.message}" }

        return responseEntity(
            HttpStatus.UNPROCESSABLE_ENTITY,
            e.message,
        )
    }

    fun responseEntity(httpStatus: HttpStatus, detail: String?): ResponseEntity<ProblemDetail> {
        return responseEntity(httpStatus, httpStatus.reasonPhrase, detail)
    }

    fun responseEntity(httpStatus: HttpStatusCode, title: String, detail: String?): ResponseEntity<ProblemDetail> {
        return ResponseEntity
            .status(httpStatus)
            .contentType(MediaType.APPLICATION_JSON)
            .body(
                ProblemDetail.forStatus(httpStatus).also {
                    it.title = title
                    it.detail = detail
                },
            )
    }
}
