package org.loculus.backend.service

import org.redundent.kotlin.xml.xml
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.stereotype.Component
import java.io.DataOutputStream
import java.io.OutputStreamWriter
import java.io.PrintWriter
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.time.LocalDate
import java.util.UUID

@ConfigurationProperties(prefix = "crossref")
data class CrossRefProperties(
    val endpoint: String,
    val username: String,
    val password: String,
)

@Component
class CrossRefService(private val crossRefProperties: CrossRefProperties) {
    fun generateCrossRefXML(data: Map<String, Any>): String {
        val now = LocalDate.now()

        val crossRef = xml("doi_batch") {
            attribute("version", "5.3.1")
            attribute("xmlns", "http://www.crossref.org/schema/5.3.1")
            attribute("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
            attribute(
                "xsi:schemaLocation",
                "http://www.crossref.org/schema/5.3.1 http://data.crossref.org/schemas/crossref5.3.1.xsd",
            )

            "head" {
                "doi_batch_id" { -UUID.randomUUID().toString() }
                "timestamp" { -System.currentTimeMillis().toString() }
            }

            "body" {
                "database" {
                    "database_metadata" { "titles" { "title" { -(data["databaseTitle"] as String) } } }
                    "dataset" {
                        "contributors" {
                            "organization" {
                                attribute("contributor_role", "author")
                                attribute("sequence", "first")

                                -(data["organizations"] as Array<String>)[0]
                            }
                            "person_name" {
                                attribute("contributor_role", "author")
                                attribute("sequence", "first")

                                "given_name" { -(data["contributors"] as Array<Array<String>>)[0][0] }
                                "surname" { -(data["contributors"] as Array<Array<String>>)[0][1] }
                            }
                        }
                        "titles" { "title" { -(data["datasetTitle"] as String) } }
                        "database_date" {
                            "publication_date" {
                                "month" { -now.format(DateTimeFormatterMM) }
                                "day" { -now.format(DateTimeFormatterdd) }
                                "year" { -now.format(DateTimeFormatteryyyy) }
                            }
                        }
                        "doi_data" {
                            "doi" { -(data["DOI"] as String) }
                            "resource" { -(data["URL"] as String) }
                        }
                    }
                }
            }
        }

        return crossRef.toString(PrintOptions(pretty = false))
    }

    fun postCrossRefXML(XML: String) {
        val formData = mapOf(
            "operation" to "doQueryUpload",
            "login_id" to crossRefProperties.username,
            "login_passwd" to crossRefProperties.password,
            "fname" to mapOf(
                "data" to XML,
                "filename" to "crossref_query.xml",
            ),
        )

        val connection = URI(crossRefProperties.endpoint).toURL().openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.doOutput = true

        val boundary = "---------------------------" + System.currentTimeMillis()
        connection.setRequestProperty("Connection", "close")
        connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        connection.setRequestProperty("User-Agent", "curl/7.81.0")

        val dataOutputStream = DataOutputStream(connection.outputStream)
        val printWriter = PrintWriter(OutputStreamWriter(dataOutputStream, "UTF-8"), true)

        formData.forEach { (key, value) ->
            if (value is String) {
                printWriter.append("--$boundary").append("\r\n")
                printWriter.append(
                    "Content-Disposition: form-data; name=\"${URLEncoder.encode(key, "UTF-8")}\"",
                ).append("\r\n")
                printWriter.append("\r\n")
                printWriter.append(value).append("\r\n")
            } else if (key == "fname" && value is Map<*, *>) {
                printWriter.append("--$boundary").append("\r\n")
                printWriter.append(
                    "Content-Disposition: form-data; name=\"${URLEncoder.encode(
                        key,
                        "UTF-8",
                    )}\"; filename=\"${URLEncoder.encode(value["filename"] as String, "UTF-8")}\"",
                ).append("\r\n")
                printWriter.append("Content-Type: application/xml").append("\r\n")
                printWriter.append("\r\n")
                printWriter.append("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>").append("\r\n")
                printWriter.append(value["data"] as String).append("\r\n\r\n")
            }
        }

        printWriter.append("--$boundary--").append("\r\n")
        printWriter.close()

        val responseCode = connection.responseCode
        if (responseCode == HttpURLConnection.HTTP_OK) {
            val response = StringBuilder()
            var byte: Int
            while (connection.inputStream.read().also { byte = it } != -1) {
                response.append(byte.toChar())
            }
            connection.inputStream.close()

            if (response.contains("FAILURE")) {
                throw RuntimeException("DOI creation request returned a \"FAILURE\" response")
            }
        } else {
            throw RuntimeException("DOI creation request returned a non-200 response status")
        }
    }
}
