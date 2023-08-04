package org.pathoplexus.backend.controller

import mu.KotlinLogging
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ControllerAdvice
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler

private val log = KotlinLogging.logger {}

@ControllerAdvice
class ExceptionHandler : ResponseEntityExceptionHandler() {

    @ExceptionHandler(Throwable::class)
    fun handleUnexpectedException(e: Throwable): ResponseEntity<ErrorResponse> {
        log.error(e) { "Caught unexpected exception: ${e.message}" }

        return ResponseEntity
            .status(HttpStatus.INTERNAL_SERVER_ERROR)
            .contentType(MediaType.APPLICATION_JSON)
            .body(
                ErrorResponse(
                    "Internal Server Error",
                    "${e.message}",
                ),
            )
    }
}

data class ErrorResponse(val title: String, val message: String)
