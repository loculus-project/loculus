package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.node.TextNode
import org.loculus.backend.api.ExternalSubmittedData
import org.loculus.backend.utils.Accession

val defaultExternalMetadata =
    ExternalSubmittedData(
        accession = "If a test result shows this, processed data was not prepared correctly.",
        version = 1,
        externalMetadata = mapOf(
            "insdc_accession_full" to TextNode("GENBANK1000.1"),
        ),
    )

val otherExternalMetadata =
    ExternalSubmittedData(
        accession = "If a test result shows this, processed data was not prepared correctly.",
        version = 1,
        externalMetadata = mapOf(
            "other_db_accession" to TextNode("DB1.1"),
        ),
    )

object PreparedExternalMetadata {
    fun successfullySubmitted(accession: Accession, version: Long = defaultExternalMetadata.version) =
        defaultExternalMetadata.copy(
            accession = accession,
            version = version,
        )
}

object PreparedOtherExternalMetadata {
    fun successfullySubmitted(accession: Accession, version: Long = defaultExternalMetadata.version) =
        otherExternalMetadata.copy(
            accession = accession,
            version = version,
        )
}
