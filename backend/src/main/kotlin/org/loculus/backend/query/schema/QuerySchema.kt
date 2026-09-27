package org.loculus.backend.query.schema

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import org.loculus.backend.config.ReferenceGenome
import java.io.File

enum class FieldType {
    STRING,
    INT,
    FLOAT,
    DATE,
    BOOLEAN,
    ;

    companion object {
        fun fromSilo(type: String): FieldType = when (type.lowercase()) {
            "string" -> STRING
            "int" -> INT
            "float" -> FLOAT
            "date" -> DATE
            "boolean" -> BOOLEAN
            else -> throw IllegalArgumentException("Unsupported metadata type '$type'")
        }
    }
}

data class MetadataField(
    val name: String,
    val type: FieldType,
    val generateIndex: Boolean = false,
    /** name of the lineage system (key into [QuerySchema.lineageDefinitions]) if this is a lineage field */
    val lineageSystem: String? = null,
)

enum class SequenceType { NUCLEOTIDE, AMINO_ACID }

/** An aligned sequence (segment or gene) with its reference. [index] is the persisted sequence index. */
data class SequenceSchema(val name: String, val type: SequenceType, val index: Int, val reference: String) {
    val alphabet: Alphabet get() = if (type == SequenceType.NUCLEOTIDE) Alphabet.NUCLEOTIDE else Alphabet.AMINO_ACID
    val length: Int get() = reference.length

    /** reference symbol index per 1-based position (index 0 unused) */
    val referenceSymbols: ByteArray = ByteArray(reference.length + 1).also { arr ->
        reference.forEachIndexed { i, c ->
            val idx = alphabet.indexOf(c)
            arr[i + 1] = (if (idx >= 0) idx else alphabet.missingIndex).toByte()
        }
    }

    fun referenceSymbolIndex(position: Int): Int = referenceSymbols[position].toInt()
}

/**
 * Everything the query engine needs to know about one organism: the LAPIS-visible metadata fields
 * (exactly the SILO database config), the sequences with their references, and lineage trees.
 */
data class QuerySchema(
    val organism: String,
    val instanceName: String,
    val primaryKey: String,
    val metadata: List<MetadataField>,
    val nucleotideSequences: List<SequenceSchema>,
    val genes: List<SequenceSchema>,
    val features: Set<String>,
    val lineageDefinitions: Map<String, LineageDefinition>,
) {
    private val fieldsByLowerName = metadata.associateBy { it.name.lowercase() }
    private val nucByLowerName = nucleotideSequences.associateBy { it.name.lowercase() }
    private val genesByLowerName = genes.associateBy { it.name.lowercase() }

    val isSingleSegmented: Boolean get() = nucleotideSequences.size == 1

    fun field(name: String): MetadataField? = fieldsByLowerName[name.lowercase()]

    fun nucleotideSequence(name: String): SequenceSchema? = nucByLowerName[name.lowercase()]

    fun gene(name: String): SequenceSchema? = genesByLowerName[name.lowercase()]

    /** Default nucleotide sequence for unnamed mutations (only exists for single-segmented organisms). */
    val defaultNucleotideSequence: SequenceSchema? get() = nucleotideSequences.singleOrNull()

    fun allSequences(): List<SequenceSchema> = nucleotideSequences + genes

    /** hash of everything that influences the persisted encoding; a change forces a projection rebuild */
    fun encodingHash(): String = (
        nucleotideSequences.map { "${it.index}:${it.name}:${it.reference.hashCode()}" } +
            genes.map { "${it.index}:${it.name}:${it.reference.hashCode()}" }
        ).joinToString("|").hashCode().toString(16)

    companion object {
        /**
         * Nucleotide sequences get indices 0..n-1, genes n..n+m-1 (both in reference genome order).
         */
        fun build(
            organism: String,
            siloDatabaseConfig: SiloDatabaseConfig,
            referenceGenome: ReferenceGenome,
            lineageDefinitions: Map<String, LineageDefinition>,
        ): QuerySchema {
            val nuc = referenceGenome.nucleotideSequences.mapIndexed { i, s ->
                SequenceSchema(s.name, SequenceType.NUCLEOTIDE, i, s.sequence)
            }
            val genes = referenceGenome.genes.mapIndexed { i, s ->
                SequenceSchema(s.name, SequenceType.AMINO_ACID, nuc.size + i, s.sequence)
            }
            require(nuc.size + genes.size <= MutationCode.MAX_SEQUENCES) { "Too many sequences for $organism" }
            val schema = siloDatabaseConfig.schema
            return QuerySchema(
                organism = organism,
                instanceName = schema.instanceName,
                primaryKey = schema.primaryKey,
                metadata = schema.metadata.map {
                    MetadataField(
                        name = it.name,
                        type = FieldType.fromSilo(it.type),
                        generateIndex = it.generateIndex ?: false,
                        lineageSystem = it.generateLineageIndex,
                    )
                },
                nucleotideSequences = nuc,
                genes = genes,
                features = schema.features.orEmpty().map { it.name }.toSet(),
                lineageDefinitions = lineageDefinitions,
            )
        }
    }
}

// --- SILO database_config.yaml model ---

data class SiloDatabaseConfig(val schema: SiloSchema)

data class SiloSchema(
    val instanceName: String,
    val opennessLevel: String? = null,
    val metadata: List<SiloMetadata>,
    val primaryKey: String,
    val features: List<SiloFeature>? = null,
)

data class SiloMetadata(
    val name: String,
    val type: String,
    val generateIndex: Boolean? = null,
    val generateLineageIndex: String? = null,
)

data class SiloFeature(val name: String)

object SiloConfigReader {
    private val yamlMapper = ObjectMapper(YAMLFactory()).registerKotlinModule()
        .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)

    fun readDatabaseConfig(file: File): SiloDatabaseConfig = yamlMapper.readValue(file, SiloDatabaseConfig::class.java)

    fun readLineageDefinition(text: String): LineageDefinition {
        @Suppress("UNCHECKED_CAST")
        val raw = yamlMapper.readValue(text, Map::class.java) as Map<String, Map<String, List<String>>?>
        return LineageDefinition(
            raw.mapValues { (_, v) ->
                LineageNode(parents = v?.get("parents").orEmpty(), aliases = v?.get("aliases").orEmpty())
            },
        )
    }
}

// --- lineages ---

data class LineageNode(val parents: List<String>, val aliases: List<String>)

/**
 * A lineage system (e.g. pango). Supports alias resolution and "lineage including sublineages".
 * Like SILO (RecombinantEdgeFollowingMode::DO_NOT_FOLLOW), sublineage expansion does not follow
 * recombinant edges: a node with more than one parent is not a descendant of any of its parents
 * (but its own single-parent descendants are descendants of it).
 */
class LineageDefinition(val nodes: Map<String, LineageNode>) {
    private val canonicalByName: Map<String, String> = buildMap {
        nodes.forEach { (name, node) ->
            put(name, name)
            node.aliases.forEach { put(it, name) }
        }
    }

    /** children for descendant expansion, not following recombinant edges (nodes with > 1 parent) */
    private val children: Map<String, List<String>> = buildMap<String, MutableList<String>> {
        nodes.forEach { (name, node) ->
            if (node.parents.size == 1) getOrPut(node.parents.single()) { mutableListOf() }.add(name)
        }
    }

    fun canonical(nameOrAlias: String): String? = canonicalByName[nameOrAlias]

    fun contains(nameOrAlias: String) = canonicalByName.containsKey(nameOrAlias)

    /** canonical names of [nameOrAlias] and (optionally) all its descendants */
    fun resolve(nameOrAlias: String, includeSublineages: Boolean): Set<String> {
        val root = canonical(nameOrAlias) ?: return emptySet()
        if (!includeSublineages) return setOf(root)
        val result = LinkedHashSet<String>()
        val stack = ArrayDeque(listOf(root))
        while (stack.isNotEmpty()) {
            val n = stack.removeLast()
            if (result.add(n)) children[n]?.let { stack.addAll(it) }
        }
        return result
    }
}
