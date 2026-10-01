package org.loculus.backend.query.api

import com.fasterxml.jackson.core.JsonEncoding
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import mu.KotlinLogging
import org.loculus.backend.controller.LoculusCustomHeaders
import org.loculus.backend.query.QuerySchemaRegistry
import org.loculus.backend.query.request.QueryBadRequestException
import org.loculus.backend.query.request.QueryNotAcceptableException
import org.loculus.backend.query.request.QueryNotFoundException
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.servlet.HandlerMapping
import java.io.ByteArrayOutputStream
import java.util.UUID

private val log = KotlinLogging.logger {}

class LapisNotFoundException(message: String) : RuntimeException(message)

class LapisNotAcceptableException(message: String) : RuntimeException(message)

class LapisUnavailableException(message: String) : RuntimeException(message)

/** `{"error":{"detail","status","title","type"},"info":{...}}` like LAPIS */
fun lapisErrorJson(status: HttpStatus, detail: String?, info: LapisInfo): ByteArray {
    val out = ByteArrayOutputStream()
    lapisJsonFactory.createGenerator(out, JsonEncoding.UTF8).use { g ->
        g.writeStartObject()
        g.writeFieldName("error")
        g.writeStartObject()
        g.writeStringField("detail", detail)
        g.writeNumberField("status", status.value())
        g.writeStringField("title", errorTitle(status, detail))
        g.writeStringField("type", "about:blank")
        g.writeEndObject()
        g.writeFieldName("info")
        info.write(g)
        g.writeEndObject()
    }
    return out.toByteArray()
}

/** LAPIS reports errors coming from SILO with the title "Bad request", its own ones with "Bad Request" */
fun errorTitle(status: HttpStatus, detail: String?): String =
    if (status == HttpStatus.BAD_REQUEST && detail?.startsWith("Error from SILO") == true) {
        "Bad request"
    } else {
        status.reasonPhrase
    }

/** LAPIS error envelopes for the query engine endpoints only (the backend's global handler stays untouched). */
@RestControllerAdvice(assignableTypes = [LapisQueryController::class])
@Order(Ordered.HIGHEST_PRECEDENCE)
@ConditionalOnProperty(prefix = "loculus.query-engine", name = ["enabled"], havingValue = "true")
class LapisExceptionHandler(private val schemas: QuerySchemaRegistry) {
    @ExceptionHandler(QueryBadRequestException::class)
    fun badRequest(e: QueryBadRequestException, request: HttpServletRequest, response: HttpServletResponse) =
        error(HttpStatus.BAD_REQUEST, e.message, request, response)

    @ExceptionHandler(LapisNotFoundException::class, QueryNotFoundException::class)
    fun notFound(e: RuntimeException, request: HttpServletRequest, response: HttpServletResponse) =
        error(HttpStatus.NOT_FOUND, e.message, request, response)

    @ExceptionHandler(LapisNotAcceptableException::class, QueryNotAcceptableException::class)
    fun notAcceptable(e: RuntimeException, request: HttpServletRequest, response: HttpServletResponse) =
        error(HttpStatus.NOT_ACCEPTABLE, e.message, request, response)

    @ExceptionHandler(LapisUnavailableException::class)
    fun unavailable(e: LapisUnavailableException, request: HttpServletRequest, response: HttpServletResponse) =
        error(HttpStatus.SERVICE_UNAVAILABLE, e.message, request, response)

    @ExceptionHandler(Throwable::class)
    fun unexpected(
        e: Throwable,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): ResponseEntity<ByteArray> {
        // after the body has started, the only way to signal the error is to abort the connection (the controller
        // has logged it)
        if (response.isCommitted) throw e
        log.error(e) {
            "Query engine: unexpected error for ${request.method} ${request.requestURI}" +
                (request.queryString?.let { "?$it" } ?: "") + ": $e"
        }
        return error(HttpStatus.INTERNAL_SERVER_ERROR, e.message, request, response)
    }

    private fun error(
        status: HttpStatus,
        detail: String?,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): ResponseEntity<ByteArray> {
        if (status.is4xxClientError) log.info { "Query engine: $status for ${request.requestURI}: $detail" }
        @Suppress("UNCHECKED_CAST")
        val organism = (request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE) as? Map<String, String>)
            ?.get("organism")
        val instanceName = organism?.let { schemas.get(it)?.instanceName } ?: "Loculus"
        val info = LapisInfo.create(null, requestId(response), instanceName, request.serverName)
        return ResponseEntity.status(status)
            .header(HttpHeaders.CONTENT_TYPE, LapisContentTypes.JSON)
            .body(lapisErrorJson(status, detail, info))
    }
}

fun requestId(response: HttpServletResponse): String =
    response.getHeader(LoculusCustomHeaders.REQUEST_ID) ?: UUID.randomUUID().toString()
