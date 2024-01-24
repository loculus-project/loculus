package org.loculus.backend.service.datauseterms

import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.TimeZone
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import mu.KotlinLogging
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.select
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsType
import org.loculus.backend.controller.BadRequestException
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.utils.Accession
import org.springframework.stereotype.Component

private val logger = KotlinLogging.logger { }

@Component
class DataUseTermsPreconditionValidator {

    fun checkThatTransitionIsAllowed(accessions: List<Accession>, newDataUseTerms: DataUseTerms) {
        val dataUseTerms = DataUseTermsTable
            .slice(
                DataUseTermsTable.accessionColumn,
                DataUseTermsTable.dataUseTermsTypeColumn,
                DataUseTermsTable.restrictedUntilColumn,
            )
            .select(
                where = {
                    (DataUseTermsTable.accessionColumn inList accessions) and DataUseTermsTable.isNewestDataUseTerms
                },
            )

        logger.debug {
            "Checking that transition is allowed for accessions " +
                "$accessions and new data use terms $newDataUseTerms. Found $dataUseTerms."
        }

        if (newDataUseTerms is DataUseTerms.Restricted) {
            dataUseTerms.forEach {
                val dataUseTermsType = DataUseTermsType.fromString(it[DataUseTermsTable.dataUseTermsTypeColumn])
                if (dataUseTermsType == DataUseTermsType.OPEN) {
                    throw UnprocessableEntityException("Cannot change data use terms from OPEN to RESTRICTED.")
                }

                val oldRestrictedUntilDate = it[DataUseTermsTable.restrictedUntilColumn]
                    ?: throw RuntimeException("Data use terms are RESTRICTED but restrictedUntil is null. Aborting.")
                if (oldRestrictedUntilDate < newDataUseTerms.restrictedUntil) {
                    throw UnprocessableEntityException(
                        "Cannot extend restricted data use period. Please choose a date before " +
                            "$oldRestrictedUntilDate.",
                    )
                }
            }
        }
    }

    fun checkThatRestrictedUntilIsAllowed(dataUseTerms: DataUseTerms) {
        if (dataUseTerms is DataUseTerms.Restricted) {
            val now = Clock.System.now().toLocalDateTime(TimeZone.UTC).date
            val oneYearFromNow = now.plus(1, DateTimeUnit.YEAR)

            if (dataUseTerms.restrictedUntil < now) {
                throw BadRequestException(
                    "The date 'restrictedUntil' must be in the future, up to a maximum of 1 year from now.",
                )
            }
            if (dataUseTerms.restrictedUntil > oneYearFromNow) {
                throw BadRequestException(
                    "The date 'restrictedUntil' must not exceed 1 year from today.",
                )
            }
        }
    }
}
