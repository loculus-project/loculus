package org.loculus.backend.api.v0.submission

import org.loculus.backend.types.GeneticSequence
import org.loculus.backend.types.SubmittedData

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
