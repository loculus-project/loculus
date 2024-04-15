package org.loculus.backend.service.datauseterms

import kotlinx.datetime.LocalDateTime
import org.jetbrains.exposed.sql.Expression
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.alias
import org.jetbrains.exposed.sql.kotlin.datetime.date
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.jetbrains.exposed.sql.max
import org.jetbrains.exposed.sql.wrapAsExpression

const val DATA_USE_TERMS_TABLE_NAME = "data_use_terms_table"

object DataUseTermsTable : Table(DATA_USE_TERMS_TABLE_NAME) {
    val accessionColumn = text("accession")
    val changeDateColumn = datetime("change_date")
    val dataUseTermsTypeColumn = text("data_use_terms_type")
    val restrictedUntilColumn = date("restricted_until").nullable()
    val userNameColumn = text("user_name")

    val isNewestDataUseTerms = changeDateColumn eq newestDataUseTermsQuery()

    private fun newestDataUseTermsQuery(): Expression<LocalDateTime?> {
        val subQueryTable = alias("subQueryTable")
        return wrapAsExpression(
            subQueryTable
                .select(subQueryTable[changeDateColumn].max())
                .where { subQueryTable[accessionColumn] eq accessionColumn },
        )
    }
}
