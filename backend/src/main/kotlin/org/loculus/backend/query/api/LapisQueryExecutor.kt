package org.loculus.backend.query.api

import org.loculus.backend.query.index.AggregatedRow
import org.loculus.backend.query.index.OrganismIndex
import org.loculus.backend.query.request.DataFormat
import org.loculus.backend.query.request.Endpoint
import org.loculus.backend.query.request.QueryBadRequestException
import org.loculus.backend.query.request.QueryRequest
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.schema.SequenceType
import org.loculus.backend.query.store.QueryStore
import org.loculus.backend.query.store.SequenceKind
import org.loculus.backend.query.store.SequenceRowConsumer
import org.roaringbitmap.RoaringBitmap
import java.io.OutputStream

/**
 * The body of a successful response. Everything that can fail with a client error has been evaluated when this
 * is created; [write] only streams (and must not be called more than once).
 * A [buffered] body is known to be small: it is rendered completely before the response starts, so that a failure
 * still gets an error status. Other bodies are streamed.
 */
class LapisBody(
    val contentType: String,
    val fileExtension: String,
    val buffered: Boolean,
    val write: (OutputStream) -> Unit,
)

object LapisContentTypes {
    const val JSON = "application/json"
    const val JSON_UTF8 = "application/json;charset=UTF-8"
    const val CSV = "text/csv;charset=UTF-8"
    const val CSV_WITHOUT_HEADERS = "text/plain"
    const val TSV = "text/tab-separated-values;charset=UTF-8"
    const val FASTA = "text/x-fasta;charset=UTF-8"
    const val NDJSON = "application/x-ndjson;charset=UTF-8"
}

/**
 * Executes parsed LAPIS requests against the in-memory [OrganismIndex] (which ids, aggregations, mutations) and
 * the [QueryStore] (records and sequences, streamed from Postgres).
 */
class LapisQueryExecutor(
    private val store: QueryStore,
    private val bufferedDetailsMaxRows: Int = BUFFERED_DETAILS_MAX_ROWS,
) {
    fun execute(organism: String, index: OrganismIndex, request: QueryRequest, info: () -> LapisInfo): LapisBody {
        val schema = index.schema
        val ids = index.evaluate(request.filter)
        return when (request.endpoint) {
            Endpoint.AGGREGATED -> tableBody(aggregated(request, index.aggregate(ids, request.fields)), request, info)

            Endpoint.DETAILS -> details(organism, schema, index, ids, request, info)

            Endpoint.NUCLEOTIDE_MUTATIONS, Endpoint.AMINO_ACID_MUTATIONS -> {
                val type = sequenceType(request.endpoint)
                val rows = index.mutations(ids, type, request.minProportion)
                tableBody(MutationTables.mutations(schema, type, rows, request), request, info)
            }

            Endpoint.NUCLEOTIDE_INSERTIONS, Endpoint.AMINO_ACID_INSERTIONS -> {
                val type = sequenceType(request.endpoint)
                tableBody(MutationTables.insertions(schema, type, index.insertions(ids, type), request), request, info)
            }

            Endpoint.UNALIGNED_NUCLEOTIDE_SEQUENCES,
            Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES,
            Endpoint.ALIGNED_AMINO_ACID_SEQUENCES,
            -> {
                val ordered = index.select(ids, request.orderBy, request.random, request.offset, request.limit)
                sequences(organism, schema, ordered, request)
            }
        }
    }

    private fun sequenceType(endpoint: Endpoint) = when (endpoint) {
        Endpoint.NUCLEOTIDE_MUTATIONS, Endpoint.NUCLEOTIDE_INSERTIONS -> SequenceType.NUCLEOTIDE
        else -> SequenceType.AMINO_ACID
    }

    // ---------------- tables ----------------

    private fun tableBody(table: Table, request: QueryRequest, info: () -> LapisInfo) =
        LapisBody(tableContentType(request.dataFormat), request.dataFormat.extension, buffered = true) { out ->
            val writer = tableWriter(request.dataFormat, table.shape, out, envelope = !request.downloadAsFile, info)
            writer.start()
            table.rows.forEach(writer::row)
            writer.finish()
        }

    private fun details(
        organism: String,
        schema: QuerySchema,
        index: OrganismIndex,
        ids: RoaringBitmap,
        request: QueryRequest,
        info: () -> LapisInfo,
    ): LapisBody {
        val fields = request.fields.ifEmpty { schema.metadata.map { it.name } }
        validateOrderBy(request.orderBy, fields)
        val ordered = index.select(ids, request.orderBy, request.random, request.offset, request.limit)
        val shape = TableShape(fields)
        val types = fields.map { schema.field(it)?.type }
        val contentType = tableContentType(request.dataFormat)
        fun convert(texts: Array<String?>): Row =
            Array(texts.size) { i -> MetadataProjector.convertText(texts[i], types[i]) }
        val newFormat = { tableFormat(request.dataFormat, shape, envelope = !request.downloadAsFile, info) }
        if (!request.downloadAsFile && ordered.size <= bufferedDetailsMaxRows) {
            // small (the search table, a sequence's page): one query on the calling thread, no fetch workers
            return LapisBody(contentType, request.dataFormat.extension, buffered = true) { out ->
                val format = newFormat()
                format.header(out)
                format.writeChunk(
                    out,
                    format.render(store.readMetadataFields(organism, ordered, fields).map(::convert)),
                )
                format.trailer(out)
                out.flush()
            }
        }
        return LapisBody(contentType, request.dataFormat.extension, buffered = false) { out ->
            val format = newFormat()
            format.header(out)
            // Postgres extracts the fields (->>), the fetch workers type and render them in parallel
            store.streamMetadataFieldChunks(
                organism,
                ordered,
                fields,
                render = { _, values -> format.render(values.map(::convert)) },
                consumer = { chunk -> format.writeChunk(out, chunk) },
            )
            format.trailer(out)
            out.flush()
        }
    }

    // ---------------- sequences ----------------

    private fun sequences(organism: String, schema: QuerySchema, ids: IntArray, request: QueryRequest): LapisBody {
        val kind = when (request.endpoint) {
            Endpoint.UNALIGNED_NUCLEOTIDE_SEQUENCES -> SequenceKind.UNALIGNED_NUCLEOTIDE
            Endpoint.ALIGNED_NUCLEOTIDE_SEQUENCES -> SequenceKind.ALIGNED_NUCLEOTIDE
            else -> SequenceKind.ALIGNED_AMINO_ACID
        }
        val byIndex = schema.allSequences().associateBy { it.index }
        val indices = request.sequenceIndices
        val names = indices.map { byIndex[it]?.name ?: error("unknown sequence index $it") }
        val slotByIndex = HashMap<Int, Int>().also { m -> indices.forEachIndexed { slot, i -> m.putIfAbsent(i, slot) } }

        return when (request.dataFormat) {
            DataFormat.FASTA -> {
                val template = FastaHeaderTemplate.parse(
                    request.fastaHeaderTemplate ?: "{${schema.primaryKey}}",
                    schema,
                )
                val types = template.fields.map { schema.field(it)?.type }
                LapisBody(LapisContentTypes.FASTA, DataFormat.FASTA.extension, buffered = false) { out ->
                    val writer = FastaWriter(out, template, names)
                    val consumer = object : SequenceRowConsumer {
                        var headerValues: Array<String?>? = null

                        override fun row(id: Int, values: Array<String?>) {
                            for (i in values.indices) {
                                values[i] =
                                    textValue(MetadataProjector.convertText(values[i], types[i]))
                            }
                            headerValues = values
                        }

                        override fun sequence(id: Int, sequenceIndex: Int, sequence: ByteArray, length: Int) =
                            writer.write(headerValues, slotByIndex.getValue(sequenceIndex), sequence, length)
                    }
                    store.streamSequenceRows(organism, kind, indices, ids, template.fields, consumer)
                    writer.finish()
                }
            }

            DataFormat.JSON, DataFormat.NDJSON -> {
                val ndjson = request.dataFormat == DataFormat.NDJSON
                val contentType = if (ndjson) LapisContentTypes.NDJSON else LapisContentTypes.JSON_UTF8
                val primaryKeyType = schema.field(schema.primaryKey)?.type
                LapisBody(contentType, request.dataFormat.extension, buffered = false) { out ->
                    val writer = JsonSequenceWriter(out, schema.primaryKey, names, ndjson)
                    writer.start()
                    val consumer = object : SequenceRowConsumer {
                        var key: Any? = null
                        var pending = false
                        val sequences = arrayOfNulls<ByteArray>(indices.size)
                        val lengths = IntArray(indices.size)

                        fun flush() {
                            if (!pending) return
                            writer.row(key, null, sequences, lengths)
                            sequences.fill(null)
                            pending = false
                        }

                        override fun row(id: Int, values: Array<String?>) {
                            flush()
                            key = MetadataProjector.convertText(values[0], primaryKeyType)
                            pending = true
                        }

                        override fun sequence(id: Int, sequenceIndex: Int, sequence: ByteArray, length: Int) {
                            val slot = slotByIndex.getValue(sequenceIndex)
                            sequences[slot] = sequence.copyOf(length)
                            lengths[slot] = length
                        }
                    }
                    store.streamSequenceRows(organism, kind, indices, ids, listOf(schema.primaryKey), consumer)
                    consumer.flush()
                    writer.finish()
                }
            }

            else -> throw QueryBadRequestException(
                "Data format ${request.dataFormat.name.lowercase()} is not supported for sequences",
            )
        }
    }

    companion object {
        /**
         * /details responses with at most this many rows (and not downloadAsFile) are buffered. The website's
         * search table (100 rows) and sequence pages (1 row) fall under it; 1000 records are at most a few MB.
         */
        const val BUFFERED_DETAILS_MAX_ROWS = 1000

        fun tableContentType(format: DataFormat) = when (format) {
            DataFormat.JSON -> LapisContentTypes.JSON

            DataFormat.CSV -> LapisContentTypes.CSV

            DataFormat.CSV_WITHOUT_HEADERS -> LapisContentTypes.CSV_WITHOUT_HEADERS

            DataFormat.TSV, DataFormat.TSV_ESCAPED -> LapisContentTypes.TSV

            else -> throw QueryBadRequestException(
                "Data format ${format.name.lowercase()} is not supported for this endpoint",
            )
        }

        fun aggregated(request: QueryRequest, groups: List<AggregatedRow>): Table {
            val columns = listOf("count") + request.fields
            validateOrderBy(request.orderBy, request.fields + "count")
            val rows: List<Row> = groups.map { g ->
                val row = arrayOfNulls<Any?>(columns.size)
                row[0] = g.count
                g.values.forEachIndexed { i, v -> row[i + 1] = v }
                row
            }
            val ordered = applyPipeline(rows, columns, request.orderBy, request.random, request.offset, request.limit)
            val csvOrder = IntArray(columns.size) { if (it < request.fields.size) it + 1 else 0 }
            return Table(TableShape(columns, csvOrder), ordered)
        }
    }
}
