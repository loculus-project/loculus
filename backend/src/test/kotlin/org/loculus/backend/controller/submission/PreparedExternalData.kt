package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.node.TextNode
import org.loculus.backend.api.ExternalSubmittedData
import org.loculus.backend.utils.Accession

val defaultexternalMetadata =
    ExternalSubmittedData(
        accession = "If a test result shows this, processed data was not prepared correctly.",
        version = 1,
        metadata = mapOf(
            "insdc_accession_full" to TextNode("GENBANK1000.1"),
        ),
    )

val otherexternalMetadata =
    ExternalSubmittedData(
        accession = "If a test result shows this, processed data was not prepared correctly.",
        version = 1,
        metadata = mapOf(
            "other_db_accession" to TextNode("DB1.1"),
        ),
    )

object PreparedexternalMetadata {
    fun successfullySubmitted(accession: Accession, version: Long = defaultexternalMetadata.version) =
        defaultexternalMetadata.copy(
            accession = accession,
            version = version,
        )
}

object PreparedOtherexternalMetadata {
    fun successfullySubmitted(accession: Accession, version: Long = defaultexternalMetadata.version) =
        otherexternalMetadata.copy(
            accession = accession,
            version = version,
        )
}
