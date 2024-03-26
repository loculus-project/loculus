package org.loculus.backend.service

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.loculus.backend.SpringBootTestWithoutDatabase
import org.loculus.backend.service.CrossRefService

@SpringBootTestWithoutDatabase
class CrossRefServiceTest(
    private val crossRefService: CrossRefService,
) {

    @Test
    fun `POST a metadata request to CrossRef's test endpoint`() {
x        println("POST a metadata request to CrossRef's test endpoint")

        val xml = crossRefService.generateCrossRefXML(mapOf(
            "databaseTitle" to "Pathoplexus Database",
            "organizations" to arrayOf("pathoplexus.org"),
            "contributors" to arrayOf(arrayOf("Pathoplexus", "Contributor")),
            "datasetTitle" to "Pathoplexus Dataset",
            "DOI" to "10.62599/XXXX",
            "URL" to "https://pathoplexus.org/"
        ))

        println("xml")
        println(xml as String)

        assertEquals(true, false)
    }
}
