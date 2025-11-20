package org.loculus.backend.service.datauseterms

import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.LocalDate
import kotlinx.datetime.plus
import mu.KotlinLogging
import org.jetbrains.exposed.sql.and
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsType
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.controller.BadRequestException
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.DateProvider
import org.springframework.stereotype.Component

private val logger = KotlinLogging.logger { }

@Component
class DataUseTermsPreconditionValidator(private val dateProvider: DateProvider, val backendConfig: BackendConfig) {

    fun constructDataUseTermsAndValidate(dataUseTermsType: DataUseTermsType?, restrictedUntil: String?): DataUseTerms =
        when (backendConfig.dataUseTerms.enabled) {
            false -> DataUseTerms.Open
            true -> when (dataUseTermsType) {
                DataUseTermsType.OPEN -> DataUseTerms.Open
                DataUseTermsType.RESTRICTED -> DataUseTerms.fromParameters(dataUseTermsType, restrictedUntil)
                    .also { checkThatRestrictedUntilDateValid(it) }
                null -> throw BadRequestException("the 'dataUseTermsType' needs to be provided.")
            }
        }

    fun checkThatTransitionIsAllowed(accessions: List<Accession>, newDataUseTerms: DataUseTerms) {
        val dataUseTerms = DataUseTermsTable
            .select(
                DataUseTermsTable.accessionColumn,
                DataUseTermsTable.dataUseTermsTypeColumn,
                DataUseTermsTable.restrictedUntilColumn,
            )
            .where { (DataUseTermsTable.accessionColumn inList accessions) and DataUseTermsTable.isNewestDataUseTerms }

        logger.debug {
            "Checking that transition is allowed for accessions " +
                "$accessions and new data use terms $newDataUseTerms. Found $dataUseTerms."
        }

        when (newDataUseTerms) {
            is DataUseTerms.Open -> {
                if (dataUseTerms.any {
                        DataUseTermsType.fromString(it[DataUseTermsTable.dataUseTermsTypeColumn]) ==
                            DataUseTermsType.OPEN
                    }
                ) {
                    throw UnprocessableEntityException(
                        "The data use terms have already been set to 'Open'-" +
                            " this will take effect in the next several minutes.",
                    )
                }
            }
            is DataUseTerms.Restricted -> {
                checkThatRestrictedUntilDateValid(newDataUseTerms)
                dataUseTerms.forEach {
                    val dataUseTermsType = DataUseTermsType.fromString(it[DataUseTermsTable.dataUseTermsTypeColumn])
                    if (dataUseTermsType == DataUseTermsType.OPEN) {
                        throw UnprocessableEntityException("Cannot change data use terms from OPEN to RESTRICTED.")
                    }

                    val oldRestrictedUntilDate = it[DataUseTermsTable.restrictedUntilColumn]
                        ?: throw RuntimeException(
                            "Data use terms are RESTRICTED but restrictedUntil is null. Aborting.",
                        )
                    if (oldRestrictedUntilDate < newDataUseTerms.restrictedUntil) {
                        throw UnprocessableEntityException(
                            "Cannot extend restricted data use period. Please choose a date before " +
                                "$oldRestrictedUntilDate.",
                        )
                    }
                }
            }
        }
    }

    fun checkThatRestrictedUntilDateValid(useTerms: DataUseTerms) {
        if (useTerms !is DataUseTerms.Restricted) {
            return
        }
        val now = dateProvider.getCurrentDate()
        when {
            useTerms.restrictedUntil < now -> {
                throw BadRequestException(
                    "The date 'restrictedUntil' must be in the future, up to a maximum of 1 year from now.",
                )
            }
            useTerms.restrictedUntil > now.plus(1, DateTimeUnit.YEAR) -> {
                throw BadRequestException(
                    "The date 'restrictedUntil' must not exceed 1 year from today.",
                )
            }
        }
    }
}
