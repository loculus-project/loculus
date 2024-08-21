package org.loculus.backend.service.crossref

import mu.KotlinLogging
import org.jsoup.Jsoup
import org.redundent.kotlin.xml.PrintOptions
import org.redundent.kotlin.xml.xml
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.stereotype.Service
import java.io.DataOutputStream
import java.io.OutputStreamWriter
import java.io.PrintWriter
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID

private val log = KotlinLogging.logger { }

@ConfigurationProperties(prefix = "crossref")
data class CrossRefServiceProperties(
    val endpoint: String?,
    val username: String?,
    val password: String?,
    val doiPrefix: String?,
)

@Service
class CrossRefService(private val crossRefServiceProperties: CrossRefServiceProperties) {
    val isActive = crossRefServiceProperties.endpoint != null &&
        crossRefServiceProperties.username != null &&
        crossRefServiceProperties.password != null &&
        crossRefServiceProperties.doiPrefix != null
    val dateTimeFormatterMM = DateTimeFormatter.ofPattern("MM")
    val dateTimeFormatterdd = DateTimeFormatter.ofPattern("dd")
    val dateTimeFormatteryyyy = DateTimeFormatter.ofPattern("yyyy")

    init {
        println("heeelo2 $crossRefServiceProperties")
    }

    private fun checkIsActive() {
        if (!isActive) {
            throw RuntimeException("The CrossRefService is not active as it has not been configured.")
        }
    }

    fun generateCrossRefXML(data: Map<String, Any>): String {
        checkIsActive()

        // Timestamp used to fill the publication date, assumed to be the moment the xml is generated
        val doiBatchID = data["DOIBatchID"] as String? ?: UUID.randomUUID().toString()
        val now = data["now"] as LocalDate? ?: LocalDate.now()

        val crossRef = xml("doi_batch") {
            // All these attributes are needed for the xml to parse correctly
            attribute("version", "5.3.1")
            attribute("xmlns", "http://www.crossref.org/schema/5.3.1")
            attribute("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
            attribute(
                "xsi:schemaLocation",
                "http://www.crossref.org/schema/5.3.1 http://data.crossref.org/schemas/crossref5.3.1.xsd",
            )

            "head" {
                // The doi_batch_id gets ignored and the actual one is assigned after the equest is processed through
                // CrossRef's queue. Because of this, presumably, the doi_batch_id is not sent back when a request to
                // the service is successful. For this, one would have to query the equest queue and retrieve it from there
                "doi_batch_id" { -doiBatchID }
                "timestamp" { -now.atStartOfDay(ZoneId.of("UTC")).toInstant().toEpochMilli().toString() }
            }

            "body" {
                "database" {
                    // Name of the database (that holds many dataset entries)
                    "database_metadata" { "titles" { "title" { -(data["databaseTitle"] as String) } } }
                    "dataset" {
                        "contributors" {
                            // At the moment, we only use the first contributor organization and the first
                            // contributor names specified in the input data. More organizations and names can
                            // be passed on the metadata, so this is open for further consideration
                            "organization" {
                                attribute("contributor_role", "author")
                                attribute("sequence", "first")

                                -((data["organizations"] as Array<*>)[0] as String)
                            }
                            "person_name" {
                                attribute("contributor_role", "author")
                                attribute("sequence", "first")

                                "given_name" { -(((data["contributors"] as Array<*>)[0] as Array<*>)[0] as String) }
                                "surname" { -(((data["contributors"] as Array<*>)[0] as Array<*>)[1] as String) }
                            }
                        }
                        // Name of this particular dataset
                        "titles" { "title" { -(data["datasetTitle"] as String) } }
                        "database_date" {
                            "publication_date" {
                                "month" { -now.format(dateTimeFormatterMM) }
                                "day" { -now.format(dateTimeFormatterdd) }
                                "year" { -now.format(dateTimeFormatteryyyy) }
                            }
                        }
                        "doi_data" {
                            // The requested DOI (pending approval from them), it needs to have a prefix
                            // for which the user is authorized to mint DOIs for
                            "doi" { -(data["DOI"] as String) }
                            // The "payload" of the DOI request, usually an URL
                            // If the request is successful, the newly minted DOI will resolve to this URL
                            "resource" { -(data["URL"] as String) }
                        }
                    }
                }
            }
        }

        // Explicitly append the xml header as the library we are using only output the "body" of it
        return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n" +
            crossRef.toString(PrintOptions(pretty = false))
    }

    fun postCrossRefXML(XML: String): String {
        checkIsActive()

        // This is needed per their API specification
        val formData = mapOf(
            "operation" to "doQueryUpload",
            "login_id" to crossRefServiceProperties.username,
            "login_passwd" to crossRefServiceProperties.password,
            "fname" to mapOf(
                "data" to XML,
                // "filename" could be any string, using the one from their code samples, though
                "filename" to "crossref_query.xml",
            ),
        )

        val connection = URI(
            crossRefServiceProperties.endpoint + "/servlet/deposit",
        ).toURL().openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.doOutput = true

        val boundary = "---------------------------" + System.currentTimeMillis()
        // Some weird edge cases come out if the Connection header is not explicitly set to "close"
        connection.setRequestProperty("Connection", "close")
        connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        // If the User-Agent does not contain the string curl, the request fails
        connection.setRequestProperty("User-Agent", "curl/7.81.0")

        val dataOutputStream = DataOutputStream(connection.outputStream)
        // Encoding has to be UTF-8, otherwise the request will fail
        val printWriter = PrintWriter(OutputStreamWriter(dataOutputStream, "UTF-8"), true)

        formData.forEach { (key, value) ->
            if (value is String) {
                // Both carriage return and new line characters have to be sent ("\r\n"),
                // otherwise the request witll cause a 500 error on CrossRef's end
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
                // The xml must be a single line, otherwise is easy to run into formatting
                // errors introduced by newlines here and there
                printWriter.append(value["data"] as String).append("\r\n\r\n")
            }
        }

        printWriter.append("--$boundary--").append("\r\n")
        printWriter.close()

        val responseCode = connection.responseCode
        if (responseCode == HttpURLConnection.HTTP_OK) {
            // Slurp the whole request, instead of reading it line by line as it is usually done,
            // because otherwise it would be trickier to work out the behavior of "\r\n".
            val response = String(connection.inputStream.readAllBytes())
            connection.inputStream.close()

            // CrossRef's API response is quite vague, they always give you back a 200 status,
            // and the only noticeable difference between a successful response vs. a failed one
            // is the presence of a "SUCCESS" or "FAILURE" string in it.

            val doc = Jsoup.parse(response)
            val text = doc.select("h2").text()

            if (text == "SUCCESS") {
                log.debug { "DOI creation successful for XML: " + XML }
            } else {
                throw RuntimeException("DOI creation request failed. \"FAILURE\" present in the response")
            }

            return text
        } else {
            throw RuntimeException("DOI creation request returned a " + responseCode.toString() + " response status")
        }
    }
}
