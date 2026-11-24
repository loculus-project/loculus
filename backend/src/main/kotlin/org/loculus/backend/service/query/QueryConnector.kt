package org.loculus.backend.service.query

import org.springframework.http.HttpHeaders
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody

class StreamedResponse(val headers: HttpHeaders, val body: StreamingResponseBody)

interface QueryConnector {
    fun metadata(params: QueryParams): StreamedResponse
}
