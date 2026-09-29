package org.loculus.backend.query.request

import org.loculus.backend.query.filter.Filter
import org.loculus.backend.query.filter.True

/** The LAPIS routes the engine serves (all under /{organism}/sample/). */
enum class Endpoint(val routeName: String) {
    DETAILS("details"),
    AGGREGATED("aggregated"),
    NUCLEOTIDE_MUTATIONS("nucleotideMutations"),
    AMINO_ACID_MUTATIONS("aminoAcidMutations"),
    NUCLEOTIDE_INSERTIONS("nucleotideInsertions"),
    AMINO_ACID_INSERTIONS("aminoAcidInsertions"),
    UNALIGNED_NUCLEOTIDE_SEQUENCES("unalignedNucleotideSequences"),
    ALIGNED_NUCLEOTIDE_SEQUENCES("alignedNucleotideSequences"),
    ALIGNED_AMINO_ACID_SEQUENCES("alignedAminoAcidSequences"),
    ;

    val isSequenceEndpoint: Boolean
        get() = this == UNALIGNED_NUCLEOTIDE_SEQUENCES ||
            this == ALIGNED_NUCLEOTIDE_SEQUENCES ||
            this == ALIGNED_AMINO_ACID_SEQUENCES
}

enum class DataFormat(val extension: String) {
    JSON("json"),
    CSV("csv"),
    CSV_WITHOUT_HEADERS("csv"),
    TSV("tsv"),
    TSV_ESCAPED("tsv"),
    FASTA("fasta"),
    NDJSON("ndjson"),
}

enum class Compression(val extension: String, val contentType: String) {
    GZIP("gz", "application/gzip"),
    ZSTD("zst", "application/zstd"),
}

enum class OrderDirection { ASCENDING, DESCENDING }

/** [field] is a canonical metadata field name, or a result column (count, proportion, mutation, ...) */
data class OrderByField(val field: String, val direction: OrderDirection)

/** random ordering; [seed] null = seeded from the current time */
data class RandomOrder(val seed: Long?)

/**
 * A fully parsed and validated LAPIS request. All names are canonical (schema spelling).
 */
data class QueryRequest(
    val endpoint: Endpoint,
    val filter: Filter = True,
    /** details/aggregated: metadata fields (canonical); mutation/insertion endpoints: result columns */
    val fields: List<String> = emptyList(),
    val orderBy: List<OrderByField> = emptyList(),
    val random: RandomOrder? = null,
    val limit: Int? = null,
    val offset: Int = 0,
    val dataFormat: DataFormat = DataFormat.JSON,
    /**
     * true if [dataFormat] was given as request parameter; otherwise it is the endpoint default and the controller
     * may still pick a format from the Accept header (as LAPIS does)
     */
    val dataFormatFromParameter: Boolean = false,
    val downloadAsFile: Boolean = false,
    val downloadFileBasename: String? = null,
    /** explicit compression request property (file download); Accept-Encoding is handled separately */
    val compression: Compression? = null,
    /** mutation endpoints */
    val minProportion: Double = 0.05,
    /** sequence endpoints: schema sequence indices to output, in output order */
    val sequenceIndices: List<Int> = emptyList(),
    /** sequence endpoints: FASTA header template, already defaulted (e.g. "{accessionVersion}|{.segment}") */
    val fastaHeaderTemplate: String? = null,
)

/** 400-type errors with the LAPIS error detail text */
class QueryBadRequestException(message: String) : RuntimeException(message)

/** 404-type errors, e.g. a {segment} path variable on a single-segmented organism or an unknown segment/gene */
class QueryNotFoundException(message: String) : RuntimeException(message)

/** 406-type errors: the requested dataFormat is not supported by the endpoint */
class QueryNotAcceptableException(message: String) : RuntimeException(message)
