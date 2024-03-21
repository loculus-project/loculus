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
import java.util.UUID

@ConfigurationProperties(prefix = "crossref")
data class CrossRefProperties(
    val username: String?,
    val password: String?,
    val url: String?,
)

@Component
class CrossRefService(private val crossRefProperties: CrossRefProperties) {
    fun generateCrossRefXML(): String {
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
                "timestamp" { -System.currentTimeMillis() }
                "depositor" {
                    "depositor_name" { -"Alex Morales" }
                    "email_address" { -"alex@moralestapia.com" }
                }
                "registrant" { -"University of Toronto" }
            }

            "body" {
                "database" {
                    "database_metadata" {
                        "contributors" {
                            "organization" {
                                attribute("contributor_role", "author")
                                attribute("sequence", "first")

                                -"The Loculus Project"
                            }
                        }
                        "titles" {
                            "title" { -"Test Dummy Organism Database" }
                        }
                        "database_date" {
                            "creation_date" {
                                "month" { -"01" }
                                "day" { -"01" }
                                "year" { -"2024" }
                            }
                            "publication_date" {
                                "month" { -"01" }
                                "day" { -"01" }
                                "year" { -"2024" }
                            }
                            "update_date" {
                                "month" { -"01" }
                                "day" { -"01" }
                                "year" { -"2024" }
                            }
                        }
                        "publisher" {
                            "publisher_name" { -"The Loculus Project" }
                            "publisher_place" { -"CH" }
                        }
                        "institution" {
                            "institution_name" { -"The Loculus Project, Institution" }
                            "institution_department" { -"The Loculus Project, Institution -> Department" }
                        }
                    }
                    "dataset" {
                        "contributors" {
                            "organization" {
                                attribute("contributor_role", "author")
                                attribute("sequence", "first")

                                -"University of Toronto"
                            }
                            "person_name" {
                                attribute("contributor_role", "author")
                                attribute("sequence", "first")

                                "given_name" { -"Alex" }
                                "surname" { -"Morales" }
                            }
                        }
                        "titles" {
                            "title" { -"Test Dataset SRA" }
                        }
                        "database_date" {
                            "creation_date" {
                                "month" { -"03" }
                                "day" { -"18" }
                                "year" { -"2024" }
                            }
                            "publication_date" {
                                "month" { -"03" }
                                "day" { -"18" }
                                "year" { -"2024" }
                            }
                            "update_date" {
                                "month" { -"03" }
                                "day" { -"18" }
                                "year" { -"2024" }
                            }
                        }
                        "description" { -"A small dataset with a few SRA libraries" }
                        "format" { -UUID.randomUUID().toString() }
                        "archive_locations" { -"" }
                        "doi_data" {
                            "doi" { -"10.1186/s44330-024-00001-8" }
                            "resource" { -"https://data.crossref.org/" }
                        }
                    }
                }
            }
        }

        return crossRef.toString()
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

        val connection = URI(crossRefProperties.url).toURL().openConnection() as HttpURLConnection
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
