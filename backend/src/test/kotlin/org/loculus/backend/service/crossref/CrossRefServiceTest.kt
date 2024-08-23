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
    private val now: LocalDate = LocalDateTime.ofInstant(
        Instant.ofEpochSecond(1711411200),
        ZoneId.of("UTC"),
    ).toLocalDate()
    private val doi = crossRefService.properties.doiPrefix + "/xxxx"

    private val crossRefXMLReference = """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <doi_batch version="5.3.1" xmlns="http://www.crossref.org/schema/5.3.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.crossref.org/schema/5.3.1 http://data.crossref.org/schemas/crossref5.3.1.xsd"><head><doi_batch_id>$doiBatchID</doi_batch_id><timestamp>1711411200000</timestamp><depositor><depositor_name>Loculus Database</depositor_name><email_address>dois@loculus.org</email_address></depositor><registrant>Loculus Database</registrant></head><body><database><database_metadata><titles><title>Loculus Database</title></titles></database_metadata><dataset><contributors><organization contributor_role="author" sequence="first">loculus.org</organization></contributors><titles><title>SeqSet: My test set</title></titles><database_date><publication_date><month>03</month><day>26</day><year>2024</year></publication_date></database_date><doi_data><doi>$doi</doi><resource>https://main.loculus.org/seqsets/LOC_SS_1?version=1</resource></doi_data></dataset></database></body></doi_batch>
    """.trimIndent()

    @Test
    fun `Create an XML metadata string complying with CrossRef's schema`() {
        val crossRefXML = crossRefService.generateCrossRefXML(
            DoiEntry(
                now,
                "SeqSet: My test set",
                doi,
                "/seqsets/LOC_SS_1?version=1",
                doiBatchID,
            ),
        )

        assertEquals(crossRefXML, crossRefXMLReference)
    }
}
