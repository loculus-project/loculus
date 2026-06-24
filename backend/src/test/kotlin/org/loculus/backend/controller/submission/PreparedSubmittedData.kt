package org.loculus.backend.controller.submission

import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.SubmittedData

val defaultSubmittedData = SubmittedData(
    mapOf(
        "date" to "2020-12-26",
        "host" to "Homo sapiens",
        "region" to "Europe",
        "country" to "Switzerland",
        "division" to "Bern",
    ),
    mapOf("custom0" to "ACTG"),
)

val emptySubmittedData =
    SubmittedData<GeneticSequence>(metadata = emptyMap(), unalignedNucleotideSequences = emptyMap())
