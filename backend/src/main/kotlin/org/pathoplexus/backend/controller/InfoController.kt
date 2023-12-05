package org.pathoplexus.backend.controller

import io.swagger.v3.oas.annotations.Hidden
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

const val PROJECT_NAME = "Pathoplexus"

@Hidden
@RestController
class InfoController {
    @RequestMapping("/", produces = [MediaType.TEXT_HTML_VALUE])
    fun htmlInfo(request: HttpServletRequest) =
        """
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
    fun jsonInfo() = Info()
}

data class Info(
    val name: String = "$PROJECT_NAME backend",
    val status: String = "Healthy",
    val documentation: String = "visit /swagger-ui/index.html",
)
