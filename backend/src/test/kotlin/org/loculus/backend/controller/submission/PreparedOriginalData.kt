package org.loculus.backend.controller.submission

import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.OriginalData

val defaultOriginalData = OriginalData(
    mapOf(
        "date" to "2020-12-26",
        "host" to "Homo sapiens",
        "region" to "Europe",
        "country" to "Switzerland",
        "division" to "Bern",
    ),
    mapOf("custom0" to "ACTG"),
)

val emptyOriginalData = OriginalData<GeneticSequence>(metadata = emptyMap(), unalignedNucleotideSequences = emptyMap())
