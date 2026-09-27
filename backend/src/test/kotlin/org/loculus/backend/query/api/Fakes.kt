package org.loculus.backend.query.api

import org.loculus.backend.query.filter.Filter
import org.loculus.backend.query.index.AggregatedRow
import org.loculus.backend.query.index.InsertionRow
import org.loculus.backend.query.index.MutationRow
import org.loculus.backend.query.index.OrganismIndex
import org.loculus.backend.query.request.OrderByField
import org.loculus.backend.query.request.RandomOrder
import org.loculus.backend.query.schema.FieldType
import org.loculus.backend.query.schema.LineageDefinition
import org.loculus.backend.query.schema.LineageNode
import org.loculus.backend.query.schema.MetadataField
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.schema.SequenceSchema
import org.loculus.backend.query.schema.SequenceType
import org.loculus.backend.query.store.QueryStore
import org.loculus.backend.query.store.SequenceKind
import org.loculus.backend.query.store.SequenceRowConsumer
import org.roaringbitmap.RoaringBitmap

fun testSchema(segments: List<String> = listOf("main"), genes: List<String> = listOf("E", "S")): QuerySchema {
    val nuc = segments.mapIndexed { i, s -> SequenceSchema(s, SequenceType.NUCLEOTIDE, i, "ACGT") }
    val aa = genes.mapIndexed { i, g -> SequenceSchema(g, SequenceType.AMINO_ACID, nuc.size + i, "MKT*") }
    return QuerySchema(
        organism = "test",
        instanceName = "Test Instance",
        primaryKey = "accessionVersion",
        metadata = listOf(
            MetadataField("accessionVersion", FieldType.STRING),
            MetadataField("country", FieldType.STRING),
            MetadataField("date", FieldType.DATE),
            MetadataField("age", FieldType.INT),
            MetadataField("coverage", FieldType.FLOAT),
            MetadataField("isRevocation", FieldType.BOOLEAN),
            MetadataField("pangoLineage", FieldType.STRING, lineageSystem = "pango"),
        ),
        nucleotideSequences = nuc,
        genes = aa,
        features = emptySet(),
        lineageDefinitions = mapOf(
            "pango" to LineageDefinition(
                linkedMapOf(
                    "A" to LineageNode(emptyList(), emptyList()),
                    "A.1" to LineageNode(listOf("A"), emptyList()),
                    "B" to LineageNode(listOf("A"), listOf("A.2")),
                ),
            ),
        ),
    )
}

/** in-memory index: [records] by id; evaluate returns all ids (filter ignored) */
class FakeIndex(
    override val schema: QuerySchema,
    private val records: Map<Int, Map<String, Any?>>,
    override val dataVersion: Long = 1234,
    var aggregateResult: List<AggregatedRow> = emptyList(),
    var mutationResult: List<MutationRow> = emptyList(),
    var insertionResult: List<InsertionRow> = emptyList(),
    /** if set, returned by select instead of id order */
    var selectResult: IntArray? = null,
) : OrganismIndex {
    var lastFilter: Filter? = null
    var lastMinProportion: Double? = null

    override fun evaluate(filter: Filter): RoaringBitmap {
        lastFilter = filter
        return RoaringBitmap.bitmapOf(*records.keys.sorted().toIntArray())
    }

    override fun aggregate(ids: RoaringBitmap, fields: List<String>) = aggregateResult

    override fun select(
        ids: RoaringBitmap,
        orderBy: List<OrderByField>,
        random: RandomOrder?,
        offset: Int,
        limit: Int?,
    ): IntArray {
        selectResult?.let { return it }
        val all = ids.toArray().drop(offset)
        return (if (limit != null) all.take(limit) else all).toIntArray()
    }

    override fun value(id: Int, field: String): Any? = records[id]?.get(field)

    override fun mutations(ids: RoaringBitmap, type: SequenceType, minProportion: Double): List<MutationRow> {
        lastMinProportion = minProportion
        return mutationResult
    }

    override fun insertions(ids: RoaringBitmap, type: SequenceType) = insertionResult
}

/** metadata JSON text + sequences (kind, sequenceIndex, id) -> sequence */
class FakeStore(
    private val metadata: Map<Int, String>,
    private val sequences: Map<Triple<SequenceKind, Int, Int>, String> = emptyMap(),
) : QueryStore {
    val requestedFieldLists = mutableListOf<List<String>>()

    override fun streamMetadataJson(
        organism: String,
        ids: IntArray,
        consumer: (id: Int, metadataJson: String) -> Unit,
    ) {
        for (id in ids) metadata[id]?.let { consumer(id, it) }
    }

    override fun streamMetadataFields(
        organism: String,
        ids: IntArray,
        fields: List<String>,
        consumer: (id: Int, values: Array<String?>) -> Unit,
    ) {
        requestedFieldLists.add(fields)
        val mapper = com.fasterxml.jackson.databind.ObjectMapper()
        for (id in ids) {
            val json = metadata[id] ?: continue
            val tree = mapper.readTree(json)
            consumer(id, Array(fields.size) { i -> tree.get(fields[i])?.takeUnless { it.isNull }?.asText() })
        }
    }

    override fun streamSequenceRows(
        organism: String,
        kind: SequenceKind,
        sequenceIndices: List<Int>,
        ids: IntArray,
        fields: List<String>,
        consumer: SequenceRowConsumer,
    ) {
        if (fields.isNotEmpty()) requestedFieldLists.add(fields)
        val mapper = com.fasterxml.jackson.databind.ObjectMapper()
        for (id in ids) {
            val json = metadata[id] ?: continue
            if (fields.isNotEmpty()) {
                val tree = mapper.readTree(json)
                consumer.row(id, Array(fields.size) { i -> tree.get(fields[i])?.takeUnless { it.isNull }?.asText() })
            }
            streamSequences(organism, kind, sequenceIndices, intArrayOf(id), consumer::sequence)
        }
    }

    override fun streamSequences(
        organism: String,
        kind: SequenceKind,
        sequenceIndices: List<Int>,
        ids: IntArray,
        consumer: (id: Int, sequenceIndex: Int, sequence: ByteArray, length: Int) -> Unit,
    ) {
        val buffer = ByteArray(1024)
        for (id in ids) {
            for (index in sequenceIndices) {
                val sequence = sequences[Triple(kind, index, id)] ?: continue
                val bytes = sequence.toByteArray()
                bytes.copyInto(buffer)
                // garbage after the sequence to make sure length is respected
                buffer[bytes.size] = 'Z'.code.toByte()
                consumer(id, index, buffer, bytes.size)
            }
        }
    }
}
