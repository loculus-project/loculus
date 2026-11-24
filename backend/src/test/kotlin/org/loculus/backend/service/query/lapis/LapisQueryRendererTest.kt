package org.loculus.backend.service.query.lapis

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.errors.UnprocessableEntityException
import org.loculus.backend.service.query.And
import org.loculus.backend.service.query.Comparison
import org.loculus.backend.service.query.Operator
import org.loculus.backend.service.query.Or

class LapisQueryRendererTest {
    private val renderer = LapisQueryRenderer()

    @Test
    fun `renders comparison operators`() {
        val cases = mapOf(
            Operator.EQUAL to "(date='2026-01-01')",
            Operator.NOT_EQUAL to "!(date='2026-01-01')",
            Operator.GREATER_THAN_OR_EQUAL to "date>=2026-01-01",
            Operator.LESS_THAN_OR_EQUAL to "date<=2026-01-01",
            Operator.GREATER_THAN to "(date>=2026-01-01 & !(date='2026-01-01'))",
            Operator.LESS_THAN to "(date<=2026-01-01 & !(date='2026-01-01'))",
        )

        cases.forEach { (operator, expected) ->
            assertThat(
                operator.name,
                renderer.render(Comparison("date", operator, listOf("2026-01-01"))),
                `is`(expected),
            )
        }
    }

    @Test
    fun `renders multi-value operators`() {
        val values = listOf("Switzerland", "Germany")

        assertThat(
            renderer.render(Comparison("country", Operator.IN, values)),
            `is`("((country='Switzerland') | (country='Germany'))"),
        )
        assertThat(
            renderer.render(Comparison("country", Operator.NOT_IN, values)),
            `is`("!((country='Switzerland') | (country='Germany'))"),
        )
    }

    @Test
    fun `renders nested logical operators`() {
        val node = And(
            listOf(
                Comparison("a", Operator.EQUAL, listOf("1")),
                Or(
                    listOf(
                        Comparison("b", Operator.EQUAL, listOf("2")),
                        Comparison("c", Operator.EQUAL, listOf("3")),
                    ),
                ),
            ),
        )

        assertThat(renderer.render(node), `is`("((a='1')) & (((b='2')) | ((c='3')))"))
    }

    @Test
    fun `escapes quotes and backslashes in values`() {
        assertThat(
            renderer.render(Comparison("country", Operator.EQUAL, listOf("Côte d'Ivoire"))),
            `is`("(country='Côte d\\'Ivoire')"),
        )
        assertThat(
            renderer.render(Comparison("name", Operator.EQUAL, listOf("a\\b"))),
            `is`("(name='a\\\\b')"),
        )
    }

    @Test
    fun `rejects all operator for metadata`() {
        assertThrows<UnprocessableEntityException> {
            renderer.render(Comparison("country", Operator.ALL, listOf("Switzerland")))
        }
    }
}
