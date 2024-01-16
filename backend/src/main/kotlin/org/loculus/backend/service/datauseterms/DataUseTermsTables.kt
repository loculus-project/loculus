package org.loculus.backend.service.datauseterms

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.date
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.loculus.backend.api.DataUseTermsType

const val DATA_USE_TERMS_TABLE_NAME = "data_use_terms_table"

object DataUseTermsTable : Table(DATA_USE_TERMS_TABLE_NAME) {
    val accessionColumn = text("accession")
    val changeDateColumn = datetime("change_date")
    val dataUseTermsTypeColumn = enumeration("data_use_terms_type", DataUseTermsType::class)
    val restrictedUntilColumn = date("restricted_until").nullable()
    val userNameColumn = text("user_name")
}
