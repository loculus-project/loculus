package org.loculus.backend.service.crossref

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.loculus.backend.SpringBootTestWithoutDatabase
import org.springframework.beans.factory.annotation.Autowired
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

@SpringBootTestWithoutDatabase
class CrossRefServiceTest(@Autowired private val crossRefService: CrossRefService) {
    private val doiBatchID: String = "3cbae87e-77b2-4560-b411-502288f3f636"
    private val doiPrefix: String = "10.62599"
    private val now: LocalDate = LocalDateTime.ofInstant(
        Instant.ofEpochSecond(1711411200),
        ZoneId.of("UTC"),
    ).toLocalDate()

    private val crossRefXMLReference = """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <doi_batch version="5.3.1" xmlns="http://www.crossref.org/schema/5.3.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.crossref.org/schema/5.3.1 http://data.crossref.org/schemas/crossref5.3.1.xsd"><head><doi_batch_id>$doiBatchID</doi_batch_id><timestamp>1711411200000</timestamp></head><body><database><database_metadata><titles><title>Pathoplexus Database</title></titles></database_metadata><dataset><contributors><organization contributor_role="author" sequence="first">pathoplexus.org</organization><person_name contributor_role="author" sequence="first"><given_name>Pathoplexus</given_name><surname>Contributor</surname></person_name></contributors><titles><title>Pathoplexus Dataset</title></titles><database_date><publication_date><month>03</month><day>26</day><year>2024</year></publication_date></database_date><doi_data><doi>$doiPrefix/XXXX</doi><resource>https://pathoplexus.org/</resource></doi_data></dataset></database></body></doi_batch>
    """.trimIndent()

    @Test
    fun `Create an XML metadata string complying with CrossRef's schema`() {
        val crossRefXML = crossRefService.generateCrossRefXML(
            mapOf(
                "DOIBatchID" to doiBatchID,
                "now" to now,
                "databaseTitle" to "Pathoplexus Database",
                "organizations" to arrayOf("pathoplexus.org"),
                "contributors" to arrayOf(arrayOf("Pathoplexus", "Contributor")),
                "datasetTitle" to "Pathoplexus Dataset",
                "DOI" to doiPrefix + "/XXXX",
                "URL" to "https://pathoplexus.org/",
            ),
        )

        assertEquals(crossRefXML, crossRefXMLReference)
    }
}
