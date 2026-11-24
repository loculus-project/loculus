package org.loculus.backend.service.query

sealed interface QueryNode

data class And(val children: List<QueryNode>) : QueryNode

data class Or(val children: List<QueryNode>) : QueryNode

data class Comparison(val field: String, val operator: Operator, val values: List<String>) : QueryNode

enum class Operator {
    EQUAL,
    NOT_EQUAL,
    LESS_THAN,
    LESS_THAN_OR_EQUAL,
    GREATER_THAN,
    GREATER_THAN_OR_EQUAL,
    IN,
    NOT_IN,
    ALL,
}
