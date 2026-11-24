package org.loculus.backend.service.query

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.errors.BadRequestException

class QueryParserTest {
    private val parser = QueryParser()

    @Test
    fun `parses a single comparison`() {
        assertThat(
            parser.parse("geoLocCountry==Switzerland"),
            `is`(Comparison("geoLocCountry", Operator.EQUAL, listOf("Switzerland"))),
        )
    }

    @Test
    fun `parses and with semicolon and keyword`() {
        val expected = And(
            listOf(
                Comparison("geoLocCountry", Operator.EQUAL, listOf("Switzerland")),
                Comparison("collectionDate", Operator.EQUAL, listOf("2026-01-01")),
            ),
        )

        assertThat(parser.parse("geoLocCountry==Switzerland;collectionDate==2026-01-01"), `is`(expected))
        assertThat(parser.parse("geoLocCountry==Switzerland and collectionDate==2026-01-01"), `is`(expected))
    }

    @Test
    fun `parses or with comma and keyword`() {
        val expected = Or(
            listOf(
                Comparison("geoLocCountry", Operator.EQUAL, listOf("Switzerland")),
                Comparison("geoLocCountry", Operator.EQUAL, listOf("Germany")),
            ),
        )

        assertThat(parser.parse("geoLocCountry==Switzerland,geoLocCountry==Germany"), `is`(expected))
        assertThat(parser.parse("geoLocCountry==Switzerland or geoLocCountry==Germany"), `is`(expected))
    }

    @Test
    fun `parses groupings`() {
        assertThat(
            parser.parse("a==1;(b==2,c==3)"),
            `is`(
                And(
                    listOf(
                        Comparison("a", Operator.EQUAL, listOf("1")),
                        Or(
                            listOf(
                                Comparison("b", Operator.EQUAL, listOf("2")),
                                Comparison("c", Operator.EQUAL, listOf("3")),
                            ),
                        ),
                    ),
                ),
            ),
        )
    }

    @Test
    fun `parses symbol and word forms of comparison operators`() {
        val cases = mapOf(
            "date!=2026-01-01" to Operator.NOT_EQUAL,
            "date<2026-01-01" to Operator.LESS_THAN,
            "date=lt=2026-01-01" to Operator.LESS_THAN,
            "date<=2026-01-01" to Operator.LESS_THAN_OR_EQUAL,
            "date=le=2026-01-01" to Operator.LESS_THAN_OR_EQUAL,
            "date>2026-01-01" to Operator.GREATER_THAN,
            "date=gt=2026-01-01" to Operator.GREATER_THAN,
            "date>=2026-01-01" to Operator.GREATER_THAN_OR_EQUAL,
            "date=ge=2026-01-01" to Operator.GREATER_THAN_OR_EQUAL,
        )

        cases.forEach { (q, operator) ->
            assertThat(q, parser.parse(q), `is`(Comparison("date", operator, listOf("2026-01-01"))))
        }
    }

    @Test
    fun `parses multi-value operators`() {
        assertThat(
            parser.parse("geoLocCountry=in=(Switzerland, Germany)"),
            `is`(Comparison("geoLocCountry", Operator.IN, listOf("Switzerland", "Germany"))),
        )
        assertThat(
            parser.parse("geoLocCountry=out=(Switzerland,Germany)"),
            `is`(Comparison("geoLocCountry", Operator.NOT_IN, listOf("Switzerland", "Germany"))),
        )
        assertThat(
            parser.parse("aa[gene:ORF1a]=all=(D614G, K200W)"),
            `is`(Comparison("aa[gene:ORF1a]", Operator.ALL, listOf("D614G", "K200W"))),
        )
    }

    @Test
    fun `parses quoted values`() {
        assertThat(
            parser.parse("geoLocCountry=='South Africa'"),
            `is`(Comparison("geoLocCountry", Operator.EQUAL, listOf("South Africa"))),
        )
    }

    @Test
    fun `rejects unknown operators`() {
        val exception = assertThrows<BadRequestException> { parser.parse("geoLocCountry=like=Switz") }

        assertThat(exception.message, containsString("=like="))
    }

    @Test
    fun `rejects malformed queries`() {
        listOf("geoLocCountry==", "(a==1", "a==1;", "").forEach { q ->
            assertThrows<BadRequestException>(q) { parser.parse(q) }
        }
    }
}
