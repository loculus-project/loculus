package org.loculus.backend.service.licenses

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.datetime

const val LICENSES_TABLE_NAME = "licenses_table"

object LicensesTable : Table(LICENSES_TABLE_NAME) {
    val accessionColumn = text("accession")
    val changeDateColumn = datetime("change_date")
    val licenseTypeColumn = text("license_type")
    val restrictedUntilColumn = datetime("restricted_until").nullable()
    val submitterColumn = text("submitter")

    override val primaryKey = PrimaryKey(accessionColumn, changeDateColumn)
}
