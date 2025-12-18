package org.loculus.backend.api

import kotlinx.datetime.LocalDate
import org.hamcrest.CoreMatchers.equalTo
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.junit.jupiter.api.Test
import org.loculus.backend.SpringBootTestWithoutDatabase
import org.springframework.beans.factory.annotation.Autowired
import tools.jackson.databind.ObjectMapper
import tools.jackson.module.kotlin.readValue

@SpringBootTestWithoutDatabase
class DataUseTermsTest(@Autowired private val objectMapper: ObjectMapper) {

    @Test
    fun `deserialize restricted`() {
        val restrictedUntil = "2021-02-01"

        val dataUseTerms = objectMapper.readValue<DataUseTerms>(
            """
            {
                "type": "RESTRICTED",
                "restrictedUntil": "$restrictedUntil"
            }
            """.replace("\n", "").replace(" ", ""),
        )

        assertThat(
            dataUseTerms,
            `is`(DataUseTerms.Restricted(LocalDate.parse(restrictedUntil))),
        )
    }

    @Test
    fun `deserialize open`() {
        val dataUseTerms = objectMapper.readValue<DataUseTerms>(
            """
            {
                "type": "OPEN"  
            }
            """.replace("\n", "").replace(" ", ""),
        )

        assertThat(dataUseTerms, `is`(DataUseTerms.Open))
    }

    @Test
    fun `serialize restricted`() {
        val restrictedUntil = "2021-02-01"

        val dataUseTerms = DataUseTerms.Restricted(LocalDate.parse(restrictedUntil))

        val expected = """
                {
                  "type" : "RESTRICTED",
                  "restrictedUntil" : "$restrictedUntil"
                }
                """

        assertThat(
            objectMapper.readTree(objectMapper.writeValueAsString(dataUseTerms)),
            equalTo(objectMapper.readTree(expected)),
        )
    }

    @Test
    fun `serialize open`() {
        val dataUseTerms = DataUseTerms.Open

        val expected = """
                {
                  "type" : "OPEN"           
                }
                """

        assertThat(
            objectMapper.readTree(objectMapper.writeValueAsString(dataUseTerms)),
            equalTo(objectMapper.readTree(expected)),
        )
    }
}
