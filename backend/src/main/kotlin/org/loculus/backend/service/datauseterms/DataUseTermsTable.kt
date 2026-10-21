package org.loculus.backend.service.datauseterms

import kotlinx.datetime.LocalDateTime
import org.jetbrains.exposed.v1.core.Expression
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.alias
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.max
import org.jetbrains.exposed.v1.core.wrapAsExpression
import org.jetbrains.exposed.v1.datetime.date
import org.jetbrains.exposed.v1.datetime.datetime
import org.jetbrains.exposed.v1.jdbc.select

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
