package org.pathoplexus.backend.controller

import org.pathoplexus.backend.service.OriginalData

val defaultOriginalData = OriginalData(
    mapOf(
        "date" to "2020-12-26",
        "host" to "Homo sapiens",
        "region" to "Europe",
        "country" to "Switzerland",
        "division" to "Bern",
    ),
    mapOf("main" to "ACTG"),
)

val emptyOriginalData = OriginalData(metadata = emptyMap(), unalignedNucleotideSequences = emptyMap())
