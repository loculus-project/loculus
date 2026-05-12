package org.loculus.backend.service.crossref

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.loculus.backend.SpringBootTestWithoutDatabase
import org.loculus.backend.api.CitationSourceType
import org.loculus.backend.api.SeqSetCitationContributor
import org.loculus.backend.api.SeqSetCitingSource
import org.springframework.beans.factory.annotation.Autowired
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

@SpringBootTestWithoutDatabase
class CrossRefServiceTest(@Autowired private val crossRefService: CrossRefService) {
    private val doiBatchID: String = "3cbae87e-77b2-4560-b411-502288f3f636"
    private val now: LocalDate = LocalDateTime.ofInstant(
        Instant.ofEpochSecond(1711411200),
        ZoneId.of("UTC"),
    ).toLocalDate()
    private val doi = crossRefService.doiPrefix + "/xxxx"

    private val crossRefXMLReference = """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <doi_batch version="5.3.1" xmlns="http://www.crossref.org/schema/5.3.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.crossref.org/schema/5.3.1 http://data.crossref.org/schemas/crossref5.3.1.xsd"><head><doi_batch_id>$doiBatchID</doi_batch_id><timestamp>1711411200000</timestamp><depositor><depositor_name>Loculus Database</depositor_name><email_address>dois@loculus.org</email_address></depositor><registrant>Loculus Database</registrant></head><body><database><database_metadata><titles><title>Loculus Database</title></titles></database_metadata><dataset><contributors><organization contributor_role="author" sequence="first">loculus.org</organization></contributors><titles><title>SeqSet: My test set</title></titles><database_date><publication_date><month>03</month><day>26</day><year>2024</year></publication_date></database_date><doi_data><doi>$doi</doi><resource>https://main.loculus.org/seqsets/LOC_SS_1.1</resource></doi_data></dataset></database></body></doi_batch>
    """.trimIndent()

    @Test
    fun `parseCrossRefCitedByXML returns citations from valid XML`() {
        val xml = """
            <crossref_result>
                <forward_link doi="10.1234/seqset-1">
                    <journal_cite>
                        <doi>10.5678/paper-1</doi>
                        <title>A citing paper</title>
                        <year>2024</year>
                        <contributors>
                            <contributor><given_name>Jane</given_name><surname>Doe</surname></contributor>
                            <contributor><given_name>John</given_name><surname>Smith</surname></contributor>
                        </contributors>
                    </journal_cite>
                </forward_link>
                <forward_link doi="10.1234/seqset-2">
                    <journal_cite>
                        <doi>10.5678/paper-2</doi>
                        <title>Another citing paper</title>
                        <year>2023</year>
                        <contributors>
                            <contributor><given_name>Alice</given_name><surname>Jones</surname></contributor>
                        </contributors>
                    </journal_cite>
                </forward_link>
            </crossref_result>
        """.trimIndent()

        val result = crossRefService.parseCrossRefCitedByXML(xml)

        assertEquals(
            mapOf(
                "10.1234/seqset-1" to listOf(
                    SeqSetCitingSource(
                        sourceId = "10.5678/paper-1",
                        sourceType = CitationSourceType.DOI,
                        title = "A citing paper",
                        year = "2024",
                        contributors = listOf(
                            SeqSetCitationContributor(givenName = "Jane", surname = "Doe"),
                            SeqSetCitationContributor(givenName = "John", surname = "Smith"),
                        ),
                    ),
                ),
                "10.1234/seqset-2" to listOf(
                    SeqSetCitingSource(
                        sourceId = "10.5678/paper-2",
                        sourceType = CitationSourceType.DOI,
                        title = "Another citing paper",
                        year = "2023",
                        contributors = listOf(
                            SeqSetCitationContributor(givenName = "Alice", surname = "Jones"),
                        ),
                    ),
                ),
            ),
            result,
        )
    }

    @Test
    fun `parseCrossRefCitedByXML returns empty list when no forward_link elements present`() {
        val xml = "<crossref_result></crossref_result>"

        val result = crossRefService.parseCrossRefCitedByXML(xml)

        assertTrue(result.isEmpty())
    }

    @Test
    fun `parseCrossRefCitedByXML skips forward_link elements with no children`() {
        val xml = """
            <crossref_result>
                <forward_link doi="10.1234/seqset-1"/>
                <forward_link doi="10.1234/seqset-2">
                    <journal_cite>
                        <doi>10.5678/paper-1</doi>
                        <title>A citing paper</title>
                        <year>2024</year>
                    </journal_cite>
                </forward_link>
            </crossref_result>
        """.trimIndent()

        val result = crossRefService.parseCrossRefCitedByXML(xml)

        assertEquals(1, result.size)
        assertTrue(result.containsKey("10.1234/seqset-2"))
    }

    @Test
    fun `parseCrossRefCitedByXML returns empty strings for missing fields within a forward_link`() {
        val xml = """
            <crossref_result>
                <forward_link>
                    <journal_cite/>
                </forward_link>
            </crossref_result>
        """.trimIndent()

        val result = crossRefService.parseCrossRefCitedByXML(xml)

        assertEquals(1, result.size)
        assertEquals(
            listOf(
                SeqSetCitingSource(
                    sourceId = "",
                    sourceType = CitationSourceType.DOI,
                    title = "",
                    year = "",
                    contributors = emptyList(),
                ),
            ),
            result[""],
        )
    }

    @Test
    fun `parseCrossRefCitedByXML returns empty list for completely malformed input`() {
        val result = crossRefService.parseCrossRefCitedByXML("this is not xml at all !!!!")

        assertTrue(result.isEmpty())
    }

    @Test
    fun `Create an XML metadata string complying with CrossRef's schema`() {
        val crossRefXML = crossRefService.generateCrossRefXML(
            DoiEntry(
                now,
                "SeqSet: My test set",
                doi,
                "/seqsets/LOC_SS_1.1",
                doiBatchID,
            ),
        )

        assertEquals(crossRefXML, crossRefXMLReference)
    }
}
