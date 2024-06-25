package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.node.TextNode
import org.loculus.backend.api.ExternalSubmittedData
import org.loculus.backend.utils.Accession

val defaultExternalData =
    ExternalSubmittedData(
        accession = "If a test result shows this, processed data was not prepared correctly.",
        version = 1,
        metadata =
        mapOf(
            "insdc_accession_full" to TextNode("GENBANK1000.1"),
        ),
    )

object PreparedExternalData {
    fun successfullySubmitted(accession: Accession, version: Long = defaultExternalData.version) =
        defaultExternalData.copy(
            accession = accession,
            version = version,
        )
}
