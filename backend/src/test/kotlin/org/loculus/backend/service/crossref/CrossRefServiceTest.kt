package org.loculus.backend.service.crossref

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.backend.SpringBootTestWithoutDatabase
import org.loculus.backend.api.CitationContributor
import org.loculus.backend.api.CitationSource
import org.loculus.backend.api.SeqSetCitationSource
import org.loculus.backend.utils.DateProvider
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

    private fun crossRefService(writeEnabled: Boolean?) = CrossRefService(
        CrossRefServiceProperties(
            endpoint = "dummy",
            username = "dummy",
            password = "dummy",
            doiPrefix = "placeholder",
            databaseName = "Loculus Database",
            email = "dois@loculus.org",
            organization = "loculus.org",
            writeEnabled = writeEnabled,
        ),
        DateProvider(),
    )

    @Test
    fun `parseCrossRefCitedByXML returns citations from valid XML across different citation types`() {
        val xml = """
            <crossref_result>
                <forward_link doi="10.1234/seqset-1">
                    <journal_cite>
                        <journal_title>Journal of Citations</journal_title>
                        <article_title>A citing journal article</article_title>
                        <contributors>
                            <contributor><given_name>Jane</given_name><surname>Doe</surname></contributor>
                            <contributor><given_name>John</given_name><surname>Smith</surname></contributor>
                        </contributors>
                        <year>2024</year>
                        <doi>10.5678/journal-paper</doi>
                    </journal_cite>
                </forward_link>
                <forward_link doi="10.1234/seqset-2">
                    <book_cite>
                        <series_title>A book series</series_title>
                        <volume_title>A citing book</volume_title>
                        <contributors>
                            <contributor><given_name>Alice</given_name><surname>Jones</surname></contributor>
                        </contributors>
                        <year>2023</year>
                        <doi>10.5678/book-chapter</doi>
                    </book_cite>
                </forward_link>
                <forward_link doi="10.1234/seqset-3">
                    <postedcontent_cite>
                        <title>A citing preprint</title>
                        <year>2022</year>
                        <doi>10.5678/preprint</doi>
                    </postedcontent_cite>
                </forward_link>
            </crossref_result>
        """.trimIndent()

        val result = crossRefService.parseCrossRefCitedByXML(xml)

        assertEquals(
            listOf(
                SeqSetCitationSource(
                    CitationSource(
                        sourceDOI = "10.5678/journal-paper",
                        title = "A citing journal article",
                        year = 2024,
                        contributors = listOf(
                            CitationContributor(givenName = "Jane", surname = "Doe"),
                            CitationContributor(givenName = "John", surname = "Smith"),
                        ),
                    ),
                    seqSetDOIs = setOf("10.1234/seqset-1"),
                ),
                SeqSetCitationSource(
                    CitationSource(
                        sourceDOI = "10.5678/book-chapter",
                        title = "A citing book",
                        year = 2023,
                        contributors = listOf(
                            CitationContributor(givenName = "Alice", surname = "Jones"),
                        ),
                    ),
                    seqSetDOIs = setOf("10.1234/seqset-2"),
                ),
                SeqSetCitationSource(
                    CitationSource(
                        sourceDOI = "10.5678/preprint",
                        title = "A citing preprint",
                        year = 2022,
                        contributors = emptyList(),
                    ),
                    seqSetDOIs = setOf("10.1234/seqset-3"),
                ),
            ),
            result.sources,
        )
        assertTrue(result.validationErrors.isEmpty())
    }

    @Test
    fun `parseCrossRefCitedByXML returns empty result when no forward_link elements present`() {
        val xml = "<crossref_result></crossref_result>"
        val result = crossRefService.parseCrossRefCitedByXML(xml)
        assertTrue(result.sources.isEmpty())
        assertTrue(result.validationErrors.isEmpty())
    }

    @ParameterizedTest(name = "parseCrossRefCitedByXML records validation error: {0}")
    @MethodSource("crossRefValidationErrorCases")
    fun `parseCrossRefCitedByXML records validation error for invalid XML`(case: CrossRefValidationErrorCase) {
        val result = crossRefService.parseCrossRefCitedByXML(case.xml)
        assertTrue(result.sources.isEmpty())
        assertEquals(1, result.validationErrors.size)
        assertTrue(result.validationErrors[0].reason.contains(case.expectedReasonContains, ignoreCase = true))
    }

    @Test
    fun `parseCrossRefCitedByXML throws for completely malformed input`() {
        val xml = "<<crossref_result>this is not valid xml at all !!!!"
        val ex = assertThrows<IllegalStateException> {
            crossRefService.parseCrossRefCitedByXML(xml)
        }
        assertTrue(ex.message!!.contains("invalid xml", ignoreCase = true))
    }

    @Test
    fun `parseCrossRefCitedByXML throws for valid xml missing crossref_result`() {
        val xml = "<someother_result>this is valid xml</someother_result>"
        val ex = assertThrows<IllegalStateException> {
            crossRefService.parseCrossRefCitedByXML(xml)
        }
        assertTrue(ex.message!!.contains("invalid crossref root element", ignoreCase = true))
    }

    @Test
    fun `parseCrossRefCitedByXML returns empty contributor list when contributors element is missing`() {
        val xml = """
          <crossref_result>
              <forward_link doi="10.1234/seqset-1">
                  <journal_cite>
                      <article_title>A citing paper</article_title>
                      <year>2024</year>
                      <doi>10.5678/paper-1</doi>
                  </journal_cite>
              </forward_link>
          </crossref_result>
        """.trimIndent()

        val result = crossRefService.parseCrossRefCitedByXML(xml)
        assertEquals(
            listOf(
                SeqSetCitationSource(
                    CitationSource(
                        sourceDOI = "10.5678/paper-1",
                        title = "A citing paper",
                        year = 2024,
                        contributors = emptyList(),
                    ),
                    seqSetDOIs = setOf("10.1234/seqset-1"),
                ),
            ),
            result.sources,
        )
    }

    @Test
    fun `parseCrossRefCitedByXML returns valid sources and records errors for invalid ones in a mixed batch`() {
        val xml = """
          <crossref_result>
              <forward_link doi="10.1234/seqset-1">
                  <journal_cite>
                      <article_title>A valid citing paper</article_title>
                      <year>2024</year>
                      <doi>10.5678/paper-1</doi>
                  </journal_cite>
              </forward_link>
              <forward_link doi="10.1234/seqset-2">
                  <journal_cite>
                      <article_title>Another paper</article_title>
                      <year>2023</year>
                  </journal_cite>
              </forward_link>
              <forward_link doi="10.1234/seqset-3">
                  <journal_cite>
                      <year>2022</year>
                      <doi>10.5678/paper-3</doi>
                  </journal_cite>
              </forward_link>
              <forward_link doi="10.1234/seqset-4">
                  <journal_cite>
                      <article_title>Another valid paper</article_title>
                      <year>2021</year>
                      <doi>10.5678/paper-4</doi>
                  </journal_cite>
              </forward_link>
          </crossref_result>
        """.trimIndent()

        val result = crossRefService.parseCrossRefCitedByXML(xml)

        assertEquals(
            listOf(
                SeqSetCitationSource(
                    CitationSource(
                        sourceDOI = "10.5678/paper-1",
                        title = "A valid citing paper",
                        year = 2024,
                        contributors = emptyList(),
                    ),
                    seqSetDOIs = setOf("10.1234/seqset-1"),
                ),
                SeqSetCitationSource(
                    CitationSource(
                        sourceDOI = "10.5678/paper-4",
                        title = "Another valid paper",
                        year = 2021,
                        contributors = emptyList(),
                    ),
                    seqSetDOIs = setOf("10.1234/seqset-4"),
                ),
            ),
            result.sources,
        )

        assertEquals(2, result.validationErrors.size)
        assertTrue(result.validationErrors[0].reason.contains("source missing doi", ignoreCase = true))
        assertTrue(result.validationErrors[0].reason.contains("10.1234/seqset-2"))
        assertTrue(result.validationErrors[1].reason.contains("missing title", ignoreCase = true))
        assertTrue(result.validationErrors[1].reason.contains("10.1234/seqset-3"))
    }

    @Test
    fun `parseCrossRefCitedByXML filters out empty contributors`() {
        val xml = """
          <crossref_result>
              <forward_link doi="10.1234/seqset-1">
                  <journal_cite>
                      <article_title>A citing paper</article_title>
                      <contributors>
                          <contributor><given_name>Jane</given_name><surname>Doe</surname></contributor>
                          <contributor></contributor>
                          <contributor><surname>Solo</surname></contributor>
                      </contributors>
                      <year>2024</year>
                      <doi>10.5678/paper-1</doi>
                  </journal_cite>
              </forward_link>
          </crossref_result>
        """.trimIndent()

        val result = crossRefService.parseCrossRefCitedByXML(xml)
        assertEquals(
            listOf(
                CitationContributor("Jane", "Doe"),
                CitationContributor("", "Solo"),
            ),
            result.sources[0].source.contributors,
        )
    }

    @Test
    fun `postCrossRefXML is rejected when write is not enabled`() {
        val readOnlyService = crossRefService(writeEnabled = false)
        val ex = assertThrows<RuntimeException> {
            readOnlyService.postCrossRefXML(crossRefXMLReference)
        }
        assertTrue(ex.message!!.contains("read-only", ignoreCase = true))
    }

    @Test
    fun `crossref write-enabled=true property string is coerced to the boolean flag`() {
        // Application properties sets crossref.write-enabled=true
        assertTrue(crossRefService.isWriteEnabled)
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

    companion object {
        data class CrossRefValidationErrorCase(
            val description: String,
            val xml: String,
            val expectedReasonContains: String,
        )

        @JvmStatic
        fun crossRefValidationErrorCases(): List<CrossRefValidationErrorCase> = listOf(
            CrossRefValidationErrorCase(
                description = "forward_link missing seqSet DOI attribute",
                xml = """
                  <crossref_result>
                      <forward_link>
                          <journal_cite>
                              <doi>10.5678/paper-1</doi>
                          </journal_cite>
                      </forward_link>
                  </crossref_result>
                """.trimIndent(),
                expectedReasonContains = "missing seqset doi",
            ),
            CrossRefValidationErrorCase(
                description = "forward_link has no citation element",
                xml = """
                  <crossref_result>
                      <forward_link doi="10.1234/seqset-1"/>
                  </crossref_result>
                """.trimIndent(),
                expectedReasonContains = "no citation element",
            ),
            CrossRefValidationErrorCase(
                description = "citation source has no DOI",
                xml = """
                  <crossref_result>
                      <forward_link doi="10.1234/seqset-1">
                          <journal_cite>
                              <article_title>A citing paper</article_title>
                              <year>2024</year>
                          </journal_cite>
                      </forward_link>
                  </crossref_result>
                """.trimIndent(),
                expectedReasonContains = "source missing doi",
            ),
            CrossRefValidationErrorCase(
                description = "citation source title is missing",
                xml = """
                  <crossref_result>
                      <forward_link doi="10.1234/seqset-1">
                          <journal_cite>
                              <year>2024</year>
                              <doi>10.5678/paper-1</doi>
                          </journal_cite>
                      </forward_link>
                  </crossref_result>
                """.trimIndent(),
                expectedReasonContains = "missing title",
            ),
            CrossRefValidationErrorCase(
                description = "citation source title is blank",
                xml = """
                  <crossref_result>
                      <forward_link doi="10.1234/seqset-1">
                          <journal_cite>
                              <article_title>  </article_title>
                              <year>2024</year>
                              <doi>10.5678/paper-1</doi>
                          </journal_cite>
                      </forward_link>
                  </crossref_result>
                """.trimIndent(),
                expectedReasonContains = "missing title",
            ),
            CrossRefValidationErrorCase(
                description = "citation source year is missing",
                xml = """
                  <crossref_result>
                      <forward_link doi="10.1234/seqset-1">
                          <journal_cite>
                              <article_title>A citing paper</article_title>
                              <doi>10.5678/paper-1</doi>
                          </journal_cite>
                      </forward_link>
                  </crossref_result>
                """.trimIndent(),
                expectedReasonContains = "missing or non-numeric year",
            ),
            CrossRefValidationErrorCase(
                description = "citation source year is non-numeric",
                xml = """
                  <crossref_result>
                      <forward_link doi="10.1234/seqset-1">
                          <journal_cite>
                              <article_title>A citing paper</article_title>
                              <year>not-a-year</year>
                              <doi>10.5678/paper-1</doi>
                          </journal_cite>
                      </forward_link>
                  </crossref_result>
                """.trimIndent(),
                expectedReasonContains = "missing or non-numeric year",
            ),
        )
    }
}
