package org.loculus.backend.controller.submission

import org.loculus.backend.api.ExternalSubmittedData
import org.loculus.backend.utils.Accession
import tools.jackson.databind.node.StringNode

val defaultExternalMetadata =
    ExternalSubmittedData(
        accession = "If a test result shows this, processed data was not prepared correctly.",
        version = 1,
        externalMetadata = mapOf(
            "insdcAccessionFull" to StringNode("GENBANK1000.1"),
        ),
    )

val otherExternalMetadata =
    ExternalSubmittedData(
        accession = "If a test result shows this, processed data was not prepared correctly.",
        version = 1,
        externalMetadata = mapOf(
            "other_db_accession" to StringNode("DB1.1"),
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
