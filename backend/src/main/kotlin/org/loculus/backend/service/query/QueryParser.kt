package org.loculus.backend.service.query

import cz.jirutka.rsql.parser.RSQLParser
import cz.jirutka.rsql.parser.RSQLParserException
import cz.jirutka.rsql.parser.ast.AndNode
import cz.jirutka.rsql.parser.ast.Arity
import cz.jirutka.rsql.parser.ast.ComparisonNode
import cz.jirutka.rsql.parser.ast.ComparisonOperator
import cz.jirutka.rsql.parser.ast.Node
import cz.jirutka.rsql.parser.ast.OrNode
import cz.jirutka.rsql.parser.ast.RSQLOperators
import org.loculus.backend.errors.BadRequestException
import org.springframework.core.convert.converter.Converter
import org.springframework.stereotype.Component

private val OPERATORS = mapOf(
    RSQLOperators.EQUAL to Operator.EQUAL,
    RSQLOperators.NOT_EQUAL to Operator.NOT_EQUAL,
    RSQLOperators.LESS_THAN to Operator.LESS_THAN,
    RSQLOperators.LESS_THAN_OR_EQUAL to Operator.LESS_THAN_OR_EQUAL,
    RSQLOperators.GREATER_THAN to Operator.GREATER_THAN,
    RSQLOperators.GREATER_THAN_OR_EQUAL to Operator.GREATER_THAN_OR_EQUAL,
    RSQLOperators.IN to Operator.IN,
    RSQLOperators.NOT_IN to Operator.NOT_IN,
    ComparisonOperator("=all=", Arity.of(1, Int.MAX_VALUE)) to Operator.ALL,
)

@Component
class QueryParser {
    private val parser = RSQLParser(OPERATORS.keys)

    fun parse(q: String): QueryNode {
        val node = try {
            parser.parse(q)
        } catch (e: RSQLParserException) {
            val message = (e.cause?.message ?: e.message).orEmpty().lineSequence().first()
            throw BadRequestException("q: $message")
        }
        return toQueryNode(node)
    }

    private fun toQueryNode(node: Node): QueryNode = when (node) {
        is AndNode -> And(node.children.map(::toQueryNode))
        is OrNode -> Or(node.children.map(::toQueryNode))
        is ComparisonNode -> Comparison(node.selector, OPERATORS.getValue(node.operator), node.arguments)
        else -> throw IllegalStateException("Unexpected RSQL node: $node")
    }
}

@Component
class QueryNodeConverter(private val queryParser: QueryParser) : Converter<String, QueryNode> {
    override fun convert(source: String) = queryParser.parse(source)
}
