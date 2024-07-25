package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Hidden
import jakarta.servlet.http.HttpServletRequest
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.config.DEBUG_MODE_ON_VALUE
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

const val PROJECT_NAME = "Loculus"

@Hidden
@RestController
class InfoController(@Value("\${${BackendSpringProperty.DEBUG_MODE}}") private val debugMode: String) {

    @RequestMapping("/", produces = [MediaType.TEXT_HTML_VALUE])
    fun htmlInfo(request: HttpServletRequest) = """
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>$PROJECT_NAME Backend</title>
        </head>
        <body>
            <h1>Welcome to the $PROJECT_NAME Backend</h1>
            <a href="${request.requestURL}swagger-ui/index.html">Visit our swagger-ui</a>
        </body>
        </html>
    """.trimIndent()

    @RequestMapping("/", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun jsonInfo() = Info(
        isInDebugMode = debugMode == DEBUG_MODE_ON_VALUE,
    )
}

data class Info(
    val name: String = "$PROJECT_NAME backend",
    val status: String = "Healthy",
    val documentation: String = "visit /swagger-ui/index.html",
    val isInDebugMode: Boolean,
)
