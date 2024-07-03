package org.loculus.backend.utils

import org.jetbrains.exposed.sql.IntegerColumnType
import org.jetbrains.exposed.sql.transactions.transaction

fun getNextSequenceNumber(sequenceName: String): Long = getNextSequenceNumbers(sequenceName, 1)[0]

fun getNextSequenceNumbers(sequenceName: String, numberOfNewEntries: Int) = transaction {
    val nextValues = exec(
        "SELECT nextval('$sequenceName') FROM generate_series(1, ?)",
        listOf(
            Pair(IntegerColumnType(), numberOfNewEntries),
        ),
    ) { rs ->
        val result = mutableListOf<Long>()
        while (rs.next()) {
            result += rs.getLong(1)
        }
        result.toList()
    } ?: emptyList()

    if (nextValues.size != numberOfNewEntries) {
        throw IllegalStateException("Expected $numberOfNewEntries values, got ${nextValues.size}.")
    }
    nextValues
}
