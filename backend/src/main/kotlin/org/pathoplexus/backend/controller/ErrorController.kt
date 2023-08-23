package org.pathoplexus.backend.controller

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import mu.KotlinLogging
import org.springframework.boot.autoconfigure.web.ErrorProperties
import org.springframework.boot.autoconfigure.web.servlet.error.BasicErrorController
import org.springframework.boot.web.servlet.error.ErrorAttributes
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.servlet.ModelAndView
import org.springframework.web.servlet.View
import org.springframework.web.servlet.support.ServletUriComponentsBuilder

private val log = KotlinLogging.logger { }

@Component
class ErrorController(errorAttributes: ErrorAttributes) :
    BasicErrorController(errorAttributes, ErrorProperties()) {

    @RequestMapping(produces = [MediaType.TEXT_HTML_VALUE])
    override fun errorHtml(request: HttpServletRequest, response: HttpServletResponse): ModelAndView {
        val modelAndView = super.errorHtml(request, response)

        response.addHeader("Content-Type", MediaType.TEXT_HTML_VALUE)

        val urlPrefix = removeErrorSegmentFromUrl(ServletUriComponentsBuilder.fromCurrentRequest().toUriString())
        val url = "$urlPrefix/swagger-ui/index.html"

        log.debug { "Generated url $url to Swagger UI in 'not found page'" }

        modelAndView.view = NotFoundView(url)
        return modelAndView
    }

    fun removeErrorSegmentFromUrl(url: String): String {
        val lastSlashIndex = url.trimEnd('/').lastIndexOf("error")
        return url.substring(0, lastSlashIndex).trim('/')
    }
}

data class NotFoundView(private val url: String?) : View {

    override fun render(model: MutableMap<String, *>?, request: HttpServletRequest, response: HttpServletResponse) {
        val html: String = """
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Error 404</title>
            </head>
            <body>
                <h1>Pathoplexus - Backend</h1>
                <h3>Page not found!</h3>
                <a href="$url">Visit our swagger-ui</a>
            </body>
            </html>
        """.trimIndent()

        response.outputStream.write(html.toByteArray())
    }
}
