package org.loculus.backend.service.query.lapis

import org.loculus.backend.errors.UnprocessableEntityException
import org.loculus.backend.service.query.And
import org.loculus.backend.service.query.Comparison
import org.loculus.backend.service.query.Operator
import org.loculus.backend.service.query.Or
import org.loculus.backend.service.query.QueryNode

class LapisQueryRenderer {
    fun render(node: QueryNode): String = when (node) {
        is And -> node.children.joinToString(" & ") { "(${render(it)})" }
        is Or -> node.children.joinToString(" | ") { "(${render(it)})" }
        is Comparison -> renderComparison(node)
    }

    private fun renderComparison(node: Comparison): String {
        val field = node.field
        val value = node.values.first()
        return when (node.operator) {
            Operator.EQUAL -> equal(field, value)
            Operator.NOT_EQUAL -> "!${equal(field, value)}"
            Operator.GREATER_THAN_OR_EQUAL -> "$field>=$value"
            Operator.LESS_THAN_OR_EQUAL -> "$field<=$value"
            Operator.GREATER_THAN -> "($field>=$value & !${equal(field, value)})"
            Operator.LESS_THAN -> "($field<=$value & !${equal(field, value)})"
            Operator.IN -> anyEqual(field, node.values)
            Operator.NOT_IN -> "!${anyEqual(field, node.values)}"
            Operator.ALL -> throw UnprocessableEntityException("q: =all= is only supported for mutations")
        }
    }

    private fun equal(field: String, value: String) = "($field='${escape(value)}')"

    private fun anyEqual(field: String, values: List<String>) =
        values.joinToString(" | ", prefix = "(", postfix = ")") { equal(field, it) }

    private fun escape(value: String) = value.replace("\\", "\\\\").replace("'", "\\'")
}
