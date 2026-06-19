package org.loculus.backend.service.crossref

import mu.KotlinLogging
import org.jsoup.Jsoup
import org.jsoup.parser.Parser
import org.loculus.backend.api.CitationContributor
import org.loculus.backend.api.CitationSource
import org.loculus.backend.api.SeqSetCitationSource
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.utils.DateProvider
import org.redundent.kotlin.xml.PrintOptions
import org.redundent.kotlin.xml.xml
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.stereotype.Service
import java.io.DataOutputStream
import java.io.IOException
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
    val databaseName: String?,
    val email: String?,
    val organization: String?,
    val writeEnabled: Boolean?,
)

data class DoiEntry(
    val date: LocalDate,
    val datasetTitle: String,
    val doi: String,
    val urlPath: String,
    val doiBatchId: String?,
)

data class CrossRefValidationError(val reason: String)

data class CrossRefCitedByResult(
    val sources: List<SeqSetCitationSource>,
    val validationErrors: List<CrossRefValidationError>,
)

@Service
class CrossRefService(
    private val properties: CrossRefServiceProperties,
    private val dateProvider: DateProvider,
    private val backendConfig: BackendConfig,
) {
    val isActive = !properties.endpoint.isNullOrBlank() &&
        !properties.username.isNullOrBlank() &&
        !properties.password.isNullOrBlank() &&
        !properties.doiPrefix.isNullOrBlank() &&
        !properties.databaseName.isNullOrBlank() &&
        !properties.email.isNullOrBlank() &&
        !properties.organization.isNullOrBlank()
    val isWriteEnabled = properties.writeEnabled == true
    val doiPrefix: String? = properties.doiPrefix
    val dateTimeFormatterMM: DateTimeFormatter = DateTimeFormatter.ofPattern("MM")
    val dateTimeFormatterdd: DateTimeFormatter = DateTimeFormatter.ofPattern("dd")
    val dateTimeFormatteryyyy: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy")

    private fun checkIsActive() {
        if (!isActive) {
            throw RuntimeException("The CrossRefService is not active as it has not been configured.")
        }
    }

    private fun checkIsWriteEnabled() {
        if (!isWriteEnabled) {
            throw RuntimeException("The CrossRefService is read-only so this action is not permitted.")
        }
    }

    fun parseCrossRefCitedByXML(citedByXML: String): CrossRefCitedByResult {
        val parser = Parser.xmlParser().setTrackErrors(1)
        val doc = Jsoup.parse(citedByXML, "", parser)

        if (parser.errors.isNotEmpty()) {
            throw IllegalStateException("Invalid XML: ${parser.errors}")
        }

        val crossRefResult = doc.children().firstOrNull()
        if (crossRefResult?.tagName() != "crossref_result") {
            throw IllegalStateException("Invalid CrossRef root element: ${crossRefResult?.tagName()}")
        }

        val validationErrors = mutableListOf<CrossRefValidationError>()
        val sources = crossRefResult.select("forward_link").mapNotNull { forwardLink ->
            // If any validation error is encountered for a forward link, we skip immediately to the next one
            val seqSetDOI = forwardLink.attr("doi").takeIf { it.isNotBlank() }
                ?: run {
                    validationErrors.add(
                        CrossRefValidationError(
                            "CrossRef forward_link missing SeqSet DOI: $forwardLink",
                        ),
                    )
                    return@mapNotNull null
                }

            val citationElement = forwardLink.children().firstOrNull()
                ?: run {
                    validationErrors.add(
                        CrossRefValidationError(
                            "CrossRef forward_link has no citation element under SeqSet $seqSetDOI: $forwardLink",
                        ),
                    )
                    return@mapNotNull null
                }

            val sourceDOI = citationElement.selectFirst("doi")?.text()?.takeIf { it.isNotBlank() }
                ?: run {
                    validationErrors.add(
                        CrossRefValidationError(
                            "CrossRef citation source missing DOI for SeqSet $seqSetDOI: $citationElement",
                        ),
                    )
                    return@mapNotNull null
                }

            // The element holding the cited work's title varies by citation type:
            // - article_title is used by journal_cite
            // - volume_title is used by book_cite, conf_cite, report_cite and standard_cite
            // - title is used by database_cite, dissertation_cite and postedcontent_cite
            // These are mutually exclusive within a given cite element.
            // See: https://data.crossref.org/reports/help/schema_doc/crossref_query_output2.0/query_output2.0.html
            val title = citationElement.selectFirst("article_title, volume_title, title")
                ?.text()?.takeIf { it.isNotBlank() }
                ?: run {
                    validationErrors.add(
                        CrossRefValidationError(
                            "CrossRef citation source missing title for SeqSet $seqSetDOI: $citationElement",
                        ),
                    )
                    return@mapNotNull null
                }

            val year = citationElement.selectFirst("year")?.text()?.toIntOrNull()
                ?: run {
                    validationErrors.add(
                        CrossRefValidationError(
                            "CrossRef citation source missing or non-numeric year for SeqSet $seqSetDOI: $citationElement",
                        ),
                    )
                    return@mapNotNull null
                }

            val contributors = citationElement.select("contributor").mapNotNull { c ->
                val givenName = c.selectFirst("given_name")?.text().orEmpty()
                val surname = c.selectFirst("surname")?.text().orEmpty()
                if (givenName.isEmpty() && surname.isEmpty()) {
                    null
                } else {
                    CitationContributor(givenName, surname)
                }
            }

            SeqSetCitationSource(
                source = CitationSource(
                    sourceDOI = sourceDOI,
                    title = title,
                    year = year,
                    contributors = contributors,
                ),
                seqSetDOIs = setOf(seqSetDOI),
            )
        }

        return CrossRefCitedByResult(sources, validationErrors)
    }

    fun getCrossRefCitedBy(doiPrefix: String): CrossRefCitedByResult {
        checkIsActive()

        // End date is the current date at time of request
        val endDate = dateProvider.getCurrentDate()

        // Retrieves citation matches (forward links) for a DOI prefix using the Crossref Cited-by service
        // https://www.crossref.org/documentation/cited-by/retrieve-citations/#00270
        val connection = URI(
            properties.endpoint +
                "/servlet/getForwardLinks?usr=${properties.username}&pwd=${properties.password}&doi=$doiPrefix&endDate=$endDate&include_postedcontent=true",
        ).toURL().openConnection() as HttpURLConnection
        connection.connectTimeout = 10_000
        connection.readTimeout = 30_000
        connection.requestMethod = "GET"

        val response = try {
            val responseCode = connection.responseCode
            if (responseCode != HttpURLConnection.HTTP_OK) {
                throw RuntimeException("CrossRef citedBy request returned $responseCode")
            }
            connection.inputStream.use { String(it.readAllBytes()) }
        } catch (e: IOException) {
            throw RuntimeException("CrossRef citedBy request failed for DOI $doiPrefix", e)
        } finally {
            connection.disconnect()
        }

        return try {
            parseCrossRefCitedByXML(response)
        } catch (e: Exception) {
            throw RuntimeException("Failed to parse CrossRef citedBy response for DOI $doiPrefix", e)
        }
    }

    fun generateCrossRefXML(entry: DoiEntry): String {
        checkIsActive()

        // Timestamp used to fill the publication date, assumed to be the moment the xml is generated
        val doiBatchID = entry.doiBatchId ?: UUID.randomUUID().toString()
        val date = entry.date

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
                // The doi_batch_id gets ignored and the actual one is assigned after the request is processed through
                // CrossRef's queue. Because of this, presumably, the doi_batch_id is not sent back when a request to
                // the service is successful. For this, one would have to query the request queue and retrieve it from there
                "doi_batch_id" { -doiBatchID }
                "timestamp" { -date.atStartOfDay(ZoneId.of("UTC")).toInstant().toEpochMilli().toString() }
                "depositor" {
                    "depositor_name" { -properties.databaseName!! }
                    "email_address" { -properties.email!! }
                }
                "registrant" { -properties.databaseName!! }
            }

            "body" {
                "database" {
                    // Name of the database (that holds many dataset entries)
                    "database_metadata" { "titles" { "title" { -properties.databaseName!! } } }
                    "dataset" {
                        "contributors" {
                            // At the moment, we only use the first contributor organization and the first
                            // contributor names specified in the input data. More organizations and names can
                            // be passed on the metadata, so this is open for further consideration
                            "organization" {
                                attribute("contributor_role", "author")
                                attribute("sequence", "first")

                                -properties.organization!!
                            }
                        }
                        // Name of this particular dataset
                        "titles" { "title" { -entry.datasetTitle } }
                        "database_date" {
                            "publication_date" {
                                "month" { -date.format(dateTimeFormatterMM) }
                                "day" { -date.format(dateTimeFormatterdd) }
                                "year" { -date.format(dateTimeFormatteryyyy) }
                            }
                        }
                        "doi_data" {
                            // The requested DOI (pending approval from them), it needs to have a prefix
                            // for which the user is authorized to mint DOIs for
                            "doi" { -entry.doi }
                            // The "payload" of the DOI request, usually an URL
                            // If the request is successful, the newly minted DOI will resolve to this URL
                            "resource" { -"${backendConfig.websiteUrl}${entry.urlPath}" }
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
        checkIsWriteEnabled()

        // This is needed per their API specification
        val formData = mapOf(
            "operation" to "doMDUpload",
            "login_id" to properties.username,
            "login_passwd" to properties.password,
            "fname" to mapOf(
                "data" to XML,
                // "filename" could be any string, using the one from their code samples, though
                "filename" to "crossref_metadata.xml",
            ),
        )

        val connection = URI(
            properties.endpoint + "/servlet/deposit",
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
                // otherwise the request will cause a 500 error on CrossRef's end
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
