package org.loculus.backend.query.request

import org.loculus.backend.query.filter.BooleanEquals
import org.loculus.backend.query.filter.DateBetween
import org.loculus.backend.query.filter.Filter
import org.loculus.backend.query.filter.FloatBetween
import org.loculus.backend.query.filter.FloatEquals
import org.loculus.backend.query.filter.IntBetween
import org.loculus.backend.query.filter.IntEquals
import org.loculus.backend.query.filter.IsNull
import org.loculus.backend.query.filter.Maybe
import org.loculus.backend.query.filter.Not
import org.loculus.backend.query.filter.StringEquals
import org.loculus.backend.query.schema.FieldType
import org.loculus.backend.query.schema.MetadataField
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.schema.SequenceSchema
import java.time.LocalDate
import java.time.format.DateTimeParseException

/**
 * Parses raw LAPIS request parameters into a [QueryRequest].
 *
 * [params]: parameter name -> values, as normalised by the controller from either
 *  - GET query / form-urlencoded POST: every value a String (repeated keys = several values), or
 *  - JSON POST body: String, Number, Boolean, null, List (flattened into values), or Map (orderBy objects).
 * [pathSequenceName]: the {segment}/{gene} path variable of sequence routes, if any.
 * [isGet]: true for GET / form requests (enables comma-splitting of list parameters like LAPIS).
 *
 * Throws [QueryBadRequestException] (400), [QueryNotFoundException] (404) or [QueryNotAcceptableException] (406).
 */
object LapisRequestParser {
    fun parse(
        schema: QuerySchema,
        endpoint: Endpoint,
        pathSequenceName: String?,
        params: Map<String, List<Any?>>,
        isGet: Boolean,
    ): QueryRequest = RequestParsing(schema, endpoint, pathSequenceName, params, isGet).parse()

    /** Result columns of the mutation endpoints, in LAPIS output order. */
    val MUTATION_FIELDS = listOf(
        "mutation",
        "count",
        "coverage",
        "proportion",
        "sequenceName",
        "mutationFrom",
        "mutationTo",
        "position",
    )

    /** Result columns of the insertion endpoints, in LAPIS output order. */
    val INSERTION_FIELDS = listOf("insertion", "count", "insertedSymbols", "position", "sequenceName")

    const val DEFAULT_MIN_PROPORTION = 0.05
}

private const val ADVANCED_QUERY = "advancedQuery"

/** request properties that are not sequence filters (canonical spelling) */
private val SPECIAL_KEYS = listOf(
    "fields",
    "orderBy",
    "limit",
    "offset",
    "dataFormat",
    "downloadAsFile",
    "downloadFileBasename",
    "compression",
    "minProportion",
    "fastaHeaderTemplate",
    "segments",
    "genes",
    "nucleotideMutations",
    "aminoAcidMutations",
    "nucleotideInsertions",
    "aminoAcidInsertions",
).associateBy { it.lowercase() }

private enum class FilterKind { EQUALS, REGEX, FROM, TO, IS_NULL, ADVANCED_QUERY }

private data class FilterKey(val name: String, val kind: FilterKind, val field: MetadataField?)

/** which filter keys are combined into one filter expression (like LAPIS' SiloFilterExpressionMapper) */
private enum class FilterGroup {
    STRING_EQUALS,
    LINEAGE,
    STRING_REGEX,
    DATE_BETWEEN,
    INT_EQUALS,
    INT_BETWEEN,
    FLOAT_EQUALS,
    FLOAT_BETWEEN,
    BOOLEAN_EQUALS,
    IS_NULL,
    ADVANCED_QUERY,
}

private data class FilterValue(val kind: FilterKind, val values: List<String?>, val originalKey: String)

private val NUCLEOTIDE_MUTATION_REGEX =
    Regex(
        """^((?<sequenceName>[a-zA-Z0-9_-]+)(?=:):)?(?<symbolFrom>[a-zA-Z]?)(?<position>\d+)(?<symbolTo>[a-zA-Z.-])?$""",
    )
private val AMINO_ACID_MUTATION_REGEX =
    Regex("""^((?<gene>[a-zA-Z0-9_-]+):)(?<symbolFrom>[a-zA-Z*]?)(?<position>\d+)(?<symbolTo>[a-zA-Z*.-])?$""")
private val NUCLEOTIDE_INSERTION_REGEX = Regex(
    """^ins_((?<segment>[a-zA-Z0-9_-]+)(?=:):)?(?<position>\d+):(?<insertions>(([a-zA-Z?]|(\.\*))+))$""",
    RegexOption.IGNORE_CASE,
)
private val AMINO_ACID_INSERTION_REGEX = Regex(
    """^ins_(?<gene>[a-zA-Z0-9_-]+):(?<position>\d+):(?<insertions>(([a-zA-Z?]|(\*))+))$""",
    RegexOption.IGNORE_CASE,
)
private val MAYBE_REGEX = Regex("""^MAYBE\((?<mutationCandidate>.+)\)$""", RegexOption.IGNORE_CASE)
private val RANDOM_SEED_REGEX = Regex("""^random\((\d+)\)$""")
private val FASTA_TEMPLATE_FIELD_REGEX = Regex("""\{([^}]+)}""")

private class RequestParsing(
    private val schema: QuerySchema,
    private val endpoint: Endpoint,
    private val pathSequenceName: String?,
    private val params: Map<String, List<Any?>>,
    private val isGet: Boolean,
) {
    private val filterKeys: Map<String, FilterKey> = LinkedHashMap<String, FilterKey>().apply {
        fun add(name: String, kind: FilterKind, field: MetadataField?) {
            put(name.lowercase(), FilterKey(name, kind, field))
        }
        schema.metadata.forEach { field ->
            add(field.name, FilterKind.EQUALS, field)
            when (field.type) {
                FieldType.STRING -> add("${field.name}.regex", FilterKind.REGEX, field)

                FieldType.DATE, FieldType.INT, FieldType.FLOAT -> {
                    add("${field.name}From", FilterKind.FROM, field)
                    add("${field.name}To", FilterKind.TO, field)
                }

                FieldType.BOOLEAN -> {}
            }
            add("${field.name}.isNull", FilterKind.IS_NULL, field)
        }
        add(ADVANCED_QUERY, FilterKind.ADVANCED_QUERY, null)
    }

    private val special = mutableMapOf<String, MutableList<Any?>>()
    private val filterGroups = LinkedHashMap<Pair<String, FilterGroup>, MutableList<FilterValue>>()

    private val isMutationEndpoint =
        endpoint == Endpoint.NUCLEOTIDE_MUTATIONS || endpoint == Endpoint.AMINO_ACID_MUTATIONS
    private val isInsertionEndpoint =
        endpoint == Endpoint.NUCLEOTIDE_INSERTIONS || endpoint == Endpoint.AMINO_ACID_INSERTIONS

    fun parse(): QueryRequest {
        classifyKeys()

        val sequenceIndicesAndTemplate = if (endpoint.isSequenceEndpoint) {
            sequenceSelection()
        } else {
            if (pathSequenceName != null) throw QueryNotFoundException("Unknown path /$pathSequenceName")
            null
        }

        val paramFilters = parseMutationsAndInsertions()
        crossValidateFilters()
        val metadataFilters = filterGroups.map { (key, values) -> mapFilterGroup(key.first, key.second, values) }
        val filter = and(metadataFilters + paramFilters)

        val fields = parseFields()
        val (orderBy, random) = parseOrderBy()
        validateOrderBy(orderBy, fields)

        val dataFormatParam = singleString("dataFormat")
        val dataFormat = parseDataFormat(dataFormatParam)

        var fastaHeaderTemplate: String? = null
        if (sequenceIndicesAndTemplate != null) {
            val requested = special["fastaHeaderTemplate"]?.let { singleString("fastaHeaderTemplate") }
            if (requested != null && dataFormat != DataFormat.FASTA) {
                badRequest("fastaHeaderTemplate is only applicable for FASTA format, but received: $requested")
            }
            fastaHeaderTemplate = if (dataFormatParam != null && dataFormat != DataFormat.FASTA) {
                null
            } else {
                validateFastaHeaderTemplate(requested ?: sequenceIndicesAndTemplate.second)
            }
        }

        return QueryRequest(
            endpoint = endpoint,
            filter = filter,
            fields = fields,
            orderBy = orderBy,
            random = random,
            limit = parseLimit(),
            offset = parseOffset(),
            dataFormat = dataFormat,
            dataFormatFromParameter = dataFormatParam != null,
            downloadAsFile = parseDownloadAsFile(),
            downloadFileBasename = singleString("downloadFileBasename"),
            compression = parseCompression(),
            minProportion = if (isMutationEndpoint) parseMinProportion() else LapisRequestParser.DEFAULT_MIN_PROPORTION,
            sequenceIndices = sequenceIndicesAndTemplate?.first.orEmpty(),
            fastaHeaderTemplate = fastaHeaderTemplate,
        )
    }

    // ---------------------------------------------------------------------------------------------
    // key classification

    private fun classifyKeys() {
        params.forEach { (key, values) ->
            val lowercaseKey = key.lowercase()
            val specialKey = SPECIAL_KEYS[lowercaseKey]
            if (specialKey != null) {
                special.getOrPut(specialKey) { mutableListOf() }.addAll(values)
                return@forEach
            }
            val filterKey = filterKeys[lowercaseKey] ?: badRequest(
                "'$key' is not a valid sequence filter key. Valid keys are: " +
                    filterKeys.values.joinToString { it.name },
            )
            val field = filterKey.field
            val group = when (filterKey.kind) {
                FilterKind.ADVANCED_QUERY -> FilterGroup.ADVANCED_QUERY

                FilterKind.IS_NULL -> FilterGroup.IS_NULL

                FilterKind.REGEX -> FilterGroup.STRING_REGEX

                FilterKind.EQUALS -> when (field!!.type) {
                    FieldType.STRING -> if (field.lineageSystem !=
                        null
                    ) {
                        FilterGroup.LINEAGE
                    } else {
                        FilterGroup.STRING_EQUALS
                    }

                    FieldType.DATE -> FilterGroup.DATE_BETWEEN

                    FieldType.INT -> FilterGroup.INT_EQUALS

                    FieldType.FLOAT -> FilterGroup.FLOAT_EQUALS

                    FieldType.BOOLEAN -> FilterGroup.BOOLEAN_EQUALS
                }

                FilterKind.FROM, FilterKind.TO -> when (field!!.type) {
                    FieldType.DATE -> FilterGroup.DATE_BETWEEN
                    FieldType.INT -> FilterGroup.INT_BETWEEN
                    else -> FilterGroup.FLOAT_BETWEEN
                }
            }
            val stringValues = values.map { toFilterValueString(it, key) }
            if (stringValues.isEmpty()) {
                badRequest("Filter '$key' must have at least one value, but got an empty list")
            }
            filterGroups.getOrPut((field?.name ?: ADVANCED_QUERY) to group) { mutableListOf() }
                .add(FilterValue(filterKey.kind, stringValues, key))
        }
    }

    private fun toFilterValueString(value: Any?, key: String): String? = when (value) {
        null -> null
        is String -> value
        is Number, is Boolean -> value.toString()
        else -> badRequest("Found unexpected value $value for $key, expected primitive or array")
    }

    // ---------------------------------------------------------------------------------------------
    // metadata filters

    private fun crossValidateFilters() {
        fun conflict(field: String, a: FilterGroup, b: FilterGroup) = filterGroups[field to a]?.let { first ->
            filterGroups[field to b]?.let { second -> first to second }
        }

        filterGroups.keys.forEach { (field, group) ->
            when (group) {
                FilterGroup.INT_EQUALS -> conflict(field, group, FilterGroup.INT_BETWEEN)?.let { (_, range) ->
                    badRequest(
                        "Cannot filter by exact int field '$field' and by int range field '${range[0].originalKey}'.",
                    )
                }

                FilterGroup.FLOAT_EQUALS -> conflict(field, group, FilterGroup.FLOAT_BETWEEN)?.let { (_, range) ->
                    badRequest(
                        "Cannot filter by exact float field '$field' " +
                            "and by float range field '${range[0].originalKey}'.",
                    )
                }

                else -> {}
            }
        }
        filterGroups.keys.filter { it.second == FilterGroup.STRING_EQUALS }.forEach { (field, _) ->
            filterGroups[field to FilterGroup.STRING_REGEX]?.let { regex ->
                badRequest(
                    "Cannot filter for string regex '${regex[0].originalKey}' " +
                        "and string equals '$field' for the same field.",
                )
            }
        }
        filterGroups.keys.filter { it.second == FilterGroup.IS_NULL }.forEach { (field, _) ->
            val conflicting = filterGroups.entries.firstOrNull { (key, _) ->
                key.first == field && key.second != FilterGroup.IS_NULL
            }
            if (conflicting != null) {
                badRequest(
                    "Cannot filter for field '${conflicting.value[0].originalKey}' " +
                        "and '$field.isNull' at the same time.",
                )
            }
        }
    }

    private fun mapFilterGroup(fieldName: String, group: FilterGroup, values: List<FilterValue>): Filter {
        if (group == FilterGroup.ADVANCED_QUERY) return mapAdvancedQuery(values)
        val field = schema.field(fieldName)!!
        val allValues = values.flatMap { it.values }
        return when (group) {
            FilterGroup.STRING_EQUALS -> or(allValues.map { StringEquals(field.name, it) })

            FilterGroup.LINEAGE -> or(allValues.map { lineageFilter(field, it) })

            FilterGroup.STRING_REGEX -> or(
                allValues.map {
                    FilterFactory.regex(
                        field,
                        it ?: badRequest("String search value for '${values[0].originalKey}' must not be null"),
                    )
                },
            )

            FilterGroup.DATE_BETWEEN -> mapDateFilter(field, values)

            FilterGroup.INT_EQUALS -> or(
                allValues.map { value ->
                    if (value == null) {
                        IsNull(field.name)
                    } else {
                        IntEquals(field.name, parseInt(value, field.name))
                    }
                },
            )

            FilterGroup.INT_BETWEEN -> IntBetween(
                field.name,
                from = singleBound(values, FilterKind.FROM)?.let { parseInt(it.second, it.first) },
                to = singleBound(values, FilterKind.TO)?.let { parseInt(it.second, it.first) },
            )

            FilterGroup.FLOAT_EQUALS -> or(
                allValues.map { value ->
                    if (value == null) {
                        IsNull(field.name)
                    } else {
                        FloatEquals(field.name, parseFloat(value, field.name))
                    }
                },
            )

            FilterGroup.FLOAT_BETWEEN -> FloatBetween(
                field.name,
                from = singleBound(values, FilterKind.FROM)?.let { parseFloat(it.second, it.first) },
                to = singleBound(values, FilterKind.TO)?.let { parseFloat(it.second, it.first) },
            )

            FilterGroup.BOOLEAN_EQUALS -> or(
                allValues.map { value ->
                    if (value == null) {
                        IsNull(field.name)
                    } else {
                        BooleanEquals(
                            field.name,
                            value.lowercase().toBooleanStrictOrNull()
                                ?: badRequest("'$value' is not a valid boolean."),
                        )
                    }
                },
            )

            FilterGroup.IS_NULL -> {
                val value = singleValue(values[0])
                val isNull = value?.lowercase()?.toBooleanStrictOrNull()
                    ?: badRequest("'$value' is not a valid boolean value for '${values[0].originalKey}'")
                if (isNull) IsNull(field.name) else Not(IsNull(field.name))
            }

            FilterGroup.ADVANCED_QUERY -> error("unreachable")
        }
    }

    private fun mapAdvancedQuery(values: List<FilterValue>): Filter {
        val allValues = values.flatMap { it.values }
        if (allValues.size != 1) {
            badRequest("$ADVANCED_QUERY must have exactly one value, found ${allValues.size} values.")
        }
        val query = allValues.single()
        if (query.isNullOrBlank()) badRequest("$ADVANCED_QUERY must not be empty, got '$query'")
        return AdvancedQueryParser.parse(schema, query)
    }

    private fun lineageFilter(field: MetadataField, value: String?): Filter = when {
        value == null -> FilterFactory.lineage(schema, field, null, false)

        value.endsWith(".*") -> FilterFactory.lineage(schema, field, value.substringBeforeLast(".*"), true)

        value.endsWith('*') -> FilterFactory.lineage(schema, field, value.substringBeforeLast('*'), true)

        value.endsWith(
            '.',
        ) -> badRequest("Invalid pango lineage: $value must not end with a dot. Did you mean '$value*'?")

        else -> FilterFactory.lineage(schema, field, value, false)
    }

    private fun mapDateFilter(field: MetadataField, values: List<FilterValue>): Filter {
        val (exact, range) = values.partition { it.kind == FilterKind.EQUALS }
        if (exact.isNotEmpty() && range.isNotEmpty()) {
            badRequest(
                "Cannot filter by exact date field '${exact[0].originalKey}' " +
                    "and by date range field '${range[0].originalKey}'.",
            )
        }
        if (exact.isNotEmpty()) {
            return or(
                exact.flatMap { v -> v.values.map { v.originalKey to it } }.map { (key, value) ->
                    if (value == null) {
                        IsNull(field.name)
                    } else {
                        parseDate(value, key).let { DateBetween(field.name, it, it) }
                    }
                },
            )
        }
        return DateBetween(
            field.name,
            from = singleBound(range, FilterKind.FROM)?.let { parseDate(it.second, it.first) },
            to = singleBound(range, FilterKind.TO)?.let { parseDate(it.second, it.first) },
        )
    }

    /** (originalKey, value) of the single value of the first filter of [kind], or null if absent / null */
    private fun singleBound(values: List<FilterValue>, kind: FilterKind): Pair<String, String>? {
        val filterValue = values.firstOrNull { it.kind == kind } ?: return null
        return singleValue(filterValue)?.let { filterValue.originalKey to it }
    }

    private fun singleValue(value: FilterValue): String? {
        if (value.values.size > 1) {
            badRequest("Expected exactly one value for '${value.originalKey}' but got ${value.values.size} values.")
        }
        return value.values[0]
    }

    private fun parseDate(value: String, key: String): Int = try {
        LocalDate.parse(value).toEpochDay().toInt()
    } catch (e: DateTimeParseException) {
        badRequest("$key '$value' is not a valid date: ${e.message}")
    }

    private fun parseInt(value: String, key: String): Long = try {
        value.toInt().toLong()
    } catch (e: NumberFormatException) {
        badRequest("$key '$value' is not a valid integer: ${e.message}")
    }

    private fun parseFloat(value: String, key: String): Double = try {
        value.toDouble()
    } catch (e: NumberFormatException) {
        badRequest("$key '$value' is not a valid float: ${e.message}")
    }

    // ---------------------------------------------------------------------------------------------
    // mutations and insertions

    private fun parseMutationsAndInsertions(): List<Filter> =
        stringList("nucleotideMutations").map { withMaybe(it) { m -> nucleotideMutation(m) } } +
            stringList("aminoAcidMutations").map { withMaybe(it) { m -> aminoAcidMutation(m) } } +
            stringList("nucleotideInsertions").map { nucleotideInsertion(it) } +
            stringList("aminoAcidInsertions").map { aminoAcidInsertion(it) }

    private fun withMaybe(candidate: String, parser: (String) -> Filter): Filter =
        when (val match = MAYBE_REGEX.find(candidate)) {
            null -> parser(candidate)
            else -> Maybe(parser(match.groups["mutationCandidate"]!!.value))
        }

    private fun parsePosition(text: String, what: String, input: String): Int =
        text.toIntOrNull() ?: badRequest("Invalid $what: $input: Did not find position")

    private fun nucleotideMutation(mutation: String): Filter {
        val match = NUCLEOTIDE_MUTATION_REGEX.find(mutation)
            ?: badRequest("Invalid nucleotide mutation: $mutation")
        val position = parsePosition(match.groups["position"]!!.value, "nucleotide mutation", mutation)
        val sequence = match.groups["sequenceName"]?.value
            ?.let { schema.nucleotideSequence(it) ?: badRequest("Unknown nucleotide sequence: $it") }
            ?: schema.defaultNucleotideSequence
            ?: badRequest(
                "The reference genome is multi-segmented, but no segment was specified in the nucleotide " +
                    "mutation '$mutation'. Please specify one, e.g. 'segmentName:A123T'.",
            )
        val symbol = match.groups["symbolTo"]?.value?.uppercase()?.single()
        return FilterFactory.mutation(sequence, position, symbol)
    }

    private fun aminoAcidMutation(mutation: String): Filter {
        val match = AMINO_ACID_MUTATION_REGEX.find(mutation)
            ?: badRequest("Invalid amino acid mutation: $mutation")
        val geneName = match.groups["gene"]!!.value
        val gene = schema.gene(geneName) ?: badRequest("Unknown gene: $geneName")
        val position = parsePosition(match.groups["position"]!!.value, "amino acid mutation", mutation)
        val symbol = match.groups["symbolTo"]?.value?.uppercase()?.single()
        return FilterFactory.mutation(gene, position, symbol)
    }

    private fun nucleotideInsertion(insertion: String): Filter {
        val match = NUCLEOTIDE_INSERTION_REGEX.find(insertion)
            ?: badRequest("Invalid nucleotide mutation: $insertion")
        val position = parsePosition(match.groups["position"]!!.value, "nucleotide insertion", insertion)
        val symbols = FilterFactory.translateInsertion(match.groups["insertions"]!!.value, aminoAcid = false)
        val sequence = match.groups["segment"]?.value
            ?.let { schema.nucleotideSequence(it) ?: badRequest("Unknown nucleotide sequence: $it") }
            ?: schema.defaultNucleotideSequence
            ?: badRequest(
                "The reference genome is multi-segmented, but no segment was specified in the nucleotide " +
                    "insertion '$insertion'. Please specify one, e.g. 'ins_segmentName:123:ABC'.",
            )
        return FilterFactory.insertion(sequence, position, symbols)
    }

    private fun aminoAcidInsertion(insertion: String): Filter {
        val match = AMINO_ACID_INSERTION_REGEX.find(insertion)
            ?: badRequest("Invalid nucleotide mutation: $insertion")
        val position = parsePosition(match.groups["position"]!!.value, "amino acid insertion", insertion)
        val geneName = match.groups["gene"]!!.value
        val gene = schema.gene(geneName) ?: badRequest("Unknown gene: $geneName")
        val symbols = FilterFactory.translateInsertion(match.groups["insertions"]!!.value, aminoAcid = true)
        return FilterFactory.insertion(gene, position, symbols)
    }

    // ---------------------------------------------------------------------------------------------
    // non-filter parameters

    /** list parameter; comma-split (and trimmed, like Spring's conversion) for GET requests */
    private fun stringList(key: String): List<String> = special[key].orEmpty().flatMap { value ->
        when (value) {
            null -> emptyList()
            is String -> if (isGet) value.split(",").map { it.trim() } else listOf(value)
            is Map<*, *> -> badRequest("$key must be an array of strings, but found $value")
            else -> listOf(value.toString())
        }
    }.filter { it.isNotEmpty() }

    private fun singleValue(key: String): Any? = special[key]?.firstOrNull()

    private fun singleString(key: String): String? = when (val value = singleValue(key)) {
        null -> null
        is String -> value
        is Number, is Boolean -> value.toString()
        else -> badRequest("$key must be a string, but was $value")
    }

    private fun parseFields(): List<String> {
        val requested = stringList("fields")
        return when {
            endpoint == Endpoint.DETAILS || endpoint == Endpoint.AGGREGATED -> requested.map { name ->
                schema.field(name)?.name ?: badRequest(
                    "Unknown field: '$name', known values are ${schema.metadata.map { it.name }}",
                )
            }

            isMutationEndpoint -> requested.map { name ->
                name.takeIf { it in LapisRequestParser.MUTATION_FIELDS } ?: badRequest(
                    "Invalid mutations field: $name. Known values are " +
                        LapisRequestParser.MUTATION_FIELDS.joinToString(),
                )
            }

            isInsertionEndpoint -> requested.map { name ->
                name.takeIf { it in LapisRequestParser.INSERTION_FIELDS } ?: badRequest(
                    "Invalid insertions field: $name. Known values are " +
                        LapisRequestParser.INSERTION_FIELDS.joinToString(),
                )
            }

            else -> emptyList()
        }
    }

    private fun cleanOrderByField(name: String) = schema.field(name)?.name ?: name

    private fun parseOrderBy(): Pair<List<OrderByField>, RandomOrder?> {
        val fields = mutableListOf<OrderByField>()
        for (value in special["orderBy"].orEmpty()) {
            when (value) {
                null -> {}

                is String -> {
                    val parts = if (isGet) {
                        value.split(",").map {
                            it.trim()
                        }.filter { it.isNotEmpty() }
                    } else {
                        listOf(value)
                    }
                    parts.forEach { fields.add(orderByFromString(it)) }
                }

                is Map<*, *> -> {
                    if (value.containsKey("random")) {
                        return emptyList<OrderByField>() to parseRandomObject(value["random"])
                    }
                    val field = value["field"] as? String
                        ?: badRequest("orderByField must have a string property \"field\", was $value")
                    val direction = when (value["type"]) {
                        null, "ascending" -> OrderDirection.ASCENDING
                        "descending" -> OrderDirection.DESCENDING
                        else -> badRequest("orderByField type must be \"ascending\" or \"descending\"")
                    }
                    fields.add(OrderByField(cleanOrderByField(field), direction))
                }

                else -> badRequest("orderByField must be a string or an object")
            }
        }

        val randomField = fields.find { it.field.startsWith("random") } ?: return fields to null
        if (randomField.field == "random") return emptyList<OrderByField>() to RandomOrder(null)
        val seed = RANDOM_SEED_REGEX.matchEntire(randomField.field)?.groupValues?.get(1)?.toIntOrNull()
            ?: badRequest(
                "Invalid random orderBy format: '${randomField.field}'. " +
                    "Use 'random' or 'random(<seed>)' where seed is a positive integer.",
            )
        return emptyList<OrderByField>() to RandomOrder(seed.toLong())
    }

    /**
     * A string orderBy entry: `field` (ascending, as in LAPIS), or `field:ascending` / `field:descending`, the GET
     * spelling of `{"field": …, "type": …}`. `random` / `random(<seed>)` take no direction.
     */
    private fun orderByFromString(value: String): OrderByField {
        val colon = value.lastIndexOf(':')
        val direction = when (if (colon < 0) null else value.substring(colon + 1)) {
            null -> return OrderByField(cleanOrderByField(value), OrderDirection.ASCENDING)

            "ascending" -> OrderDirection.ASCENDING

            "descending" -> OrderDirection.DESCENDING

            else -> badRequest(
                "Invalid orderBy '$value': use 'field', 'field:ascending' or 'field:descending'",
            )
        }
        val field = value.substring(0, colon).trim()
        if (field.isEmpty()) badRequest("Invalid orderBy '$value': the field name is missing")
        if (field.startsWith("random")) {
            badRequest("Invalid orderBy '$value': random ordering takes no direction")
        }
        return OrderByField(cleanOrderByField(field), direction)
    }

    private fun parseRandomObject(value: Any?): RandomOrder = when {
        value == true -> RandomOrder(null)
        value is Int || value is Long || value is Short || value is Byte -> RandomOrder((value as Number).toLong())
        else -> badRequest("random must be true or an integer seed")
    }

    private fun validateOrderBy(orderBy: List<OrderByField>, fields: List<String>) {
        if (orderBy.isEmpty()) return
        val allowed = when {
            endpoint == Endpoint.DETAILS -> fields.ifEmpty { schema.metadata.map { it.name } }
            endpoint == Endpoint.AGGREGATED -> fields + "count"
            isMutationEndpoint -> LapisRequestParser.MUTATION_FIELDS
            isInsertionEndpoint -> LapisRequestParser.INSERTION_FIELDS
            else -> schema.metadata.map { it.name }
        }
        orderBy.firstOrNull { it.field !in allowed }?.let {
            siloError(
                "OrderByField ${it.field} is not contained in the result of this operation. " +
                    "Allowed values are ${allowed.joinToString(", ")}.",
            )
        }
    }

    private fun parseIntParameter(key: String): Int? {
        if (!special.containsKey(key)) return null
        return when (val value = singleValue(key)) {
            null -> 0

            is Number -> value.toInt()

            is String -> if (isGet) {
                value.trim().toIntOrNull()
                    ?: badRequest("Failed to convert '$key' with value: '$value'")
            } else {
                badRequest("$key must be a number or null, but was \"$value\" (STRING)")
            }

            else -> badRequest("$key must be a number or null, but was $value")
        }
    }

    private fun parseLimit(): Int? {
        val limit = parseIntParameter("limit") ?: return null
        if (limit <= 0) siloError("limit must be a positive number")
        return limit
    }

    private fun parseOffset(): Int {
        val offset = parseIntParameter("offset") ?: return 0
        if (offset < 0) siloError("Cannot cast $offset to uint32. Value out of range")
        return offset
    }

    private fun parseMinProportion(): Double {
        val value = parseMinProportionValue()
        if (!(value >= 0.0 && value <= 1.0)) {
            siloError("Invalid proportion: minProportion must be in interval [0.0, 1.0]")
        }
        return value
    }

    private fun parseMinProportionValue(): Double = when (val value = singleValue("minProportion")) {
        null -> LapisRequestParser.DEFAULT_MIN_PROPORTION

        is Number -> value.toDouble()

        is String -> if (isGet) {
            value.trim().toDoubleOrNull() ?: badRequest("Failed to convert 'minProportion' with value: '$value'")
        } else {
            badRequest("minProportion must be a number, is \"$value\"")
        }

        else -> badRequest("minProportion must be a number, is $value")
    }

    private fun parseDownloadAsFile(): Boolean = when (val value = singleValue("downloadAsFile")) {
        null -> false

        is Boolean -> value

        is String -> when (value.trim().lowercase()) {
            "true", "on", "yes", "1" -> true
            "false", "off", "no", "0", "" -> false
            else -> badRequest("Failed to convert 'downloadAsFile' with value: '$value'")
        }

        else -> badRequest("downloadAsFile must be a boolean, but was $value")
    }

    private fun parseCompression(): Compression? {
        val value = singleString("compression") ?: return null
        return Compression.entries.find { it.name.lowercase() == value } ?: badRequest(
            "Unknown compression format: $value. Supported formats are: " +
                Compression.entries.joinToString { it.name.lowercase() },
        )
    }

    private fun parseDataFormat(value: String?): DataFormat {
        if (value == null) return if (endpoint.isSequenceEndpoint) DataFormat.FASTA else DataFormat.JSON
        val format = DataFormat.entries.find { it.name.replace('_', '-').equals(value, ignoreCase = true) }
        val allowed = if (endpoint.isSequenceEndpoint) {
            setOf(DataFormat.FASTA, DataFormat.JSON, DataFormat.NDJSON)
        } else {
            setOf(
                DataFormat.JSON,
                DataFormat.CSV,
                DataFormat.CSV_WITHOUT_HEADERS,
                DataFormat.TSV,
                DataFormat.TSV_ESCAPED,
            )
        }
        if (format == null || format !in allowed) {
            throw QueryNotAcceptableException(
                "Unsupported dataFormat '$value' for ${endpoint.routeName}. Supported formats are: " +
                    allowed.joinToString { it.name.lowercase().replace('_', '-') },
            )
        }
        return format
    }

    // ---------------------------------------------------------------------------------------------
    // sequence endpoints

    /** (sequence indices, default FASTA header template) */
    private fun sequenceSelection(): Pair<List<Int>, String> {
        val primaryKey = "{${schema.primaryKey}}"
        if (endpoint == Endpoint.ALIGNED_AMINO_ACID_SEQUENCES) {
            if (pathSequenceName != null) {
                val gene = schema.gene(pathSequenceName)
                    ?: throw QueryNotFoundException("Unknown gene: $pathSequenceName")
                return listOf(gene.index) to primaryKey
            }
            val genes = selectSequences("genes", "gene", "genes", schema.genes) { schema.gene(it) }
            return genes to "$primaryKey|{.gene}"
        }
        if (schema.isSingleSegmented) {
            if (pathSequenceName != null) throw QueryNotFoundException("Unknown segment: $pathSequenceName")
            return listOf(schema.nucleotideSequences.single().index) to primaryKey
        }
        if (pathSequenceName != null) {
            val segment = schema.nucleotideSequence(pathSequenceName)
                ?: throw QueryNotFoundException("Unknown segment: $pathSequenceName")
            return listOf(segment.index) to primaryKey
        }
        val segments =
            selectSequences("segments", "segment", "segments", schema.nucleotideSequences) {
                schema.nucleotideSequence(it)
            }
        return segments to "$primaryKey|{.segment}"
    }

    private fun selectSequences(
        key: String,
        singular: String,
        plural: String,
        all: List<SequenceSchema>,
        lookup: (String) -> SequenceSchema?,
    ): List<Int> {
        if (special[key] == null) return all.map { it.index }
        return stringList(key).map { name ->
            lookup(name)?.index ?: badRequest(
                "Unknown $singular: $name, " +
                    "available $plural: ${all.map { it.name }}",
            )
        }
    }

    /** validates the placeholders and rewrites them to canonical spelling (schema field names, `.segment`, `.gene`) */
    private fun validateFastaHeaderTemplate(template: String): String {
        val isNucleotide = endpoint != Endpoint.ALIGNED_AMINO_ACID_SEQUENCES
        return FASTA_TEMPLATE_FIELD_REGEX.replace(template) { match ->
            when (val name = match.groupValues[1].lowercase()) {
                ".segment" -> {
                    if (!isNucleotide) {
                        badRequest(
                            "Invalid FASTA header template: '.segment' is only valid for nucleotide sequences.",
                        )
                    }
                    "{.segment}"
                }

                ".gene" -> {
                    if (isNucleotide) {
                        badRequest(
                            "Invalid FASTA header template: '.gene' is only valid for amino acid sequences.",
                        )
                    }
                    "{.gene}"
                }

                else -> {
                    val field = schema.field(name) ?: badRequest(
                        "Invalid FASTA header template: '$name' is not a valid metadata field. " +
                            "Available fields: ${schema.metadata.joinToString(", ") { it.name }}. " +
                            if (isNucleotide) {
                                "Use {.segment} as a placeholder for segment name."
                            } else {
                                "Use {.gene} as a placeholder for gene name."
                            },
                    )
                    "{${field.name}}"
                }
            }
        }
    }
}
