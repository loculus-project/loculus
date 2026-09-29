package org.loculus.backend.query.api

import com.fasterxml.jackson.core.JsonEncoding
import com.fasterxml.jackson.core.JsonFactory
import com.fasterxml.jackson.core.JsonGenerator
import com.fasterxml.jackson.core.io.SerializedString
import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVPrinter
import org.loculus.backend.query.request.DataFormat
import org.loculus.backend.query.request.OrderByField
import org.loculus.backend.query.request.OrderDirection
import org.loculus.backend.query.request.QueryBadRequestException
import org.loculus.backend.query.request.RandomOrder
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import kotlin.random.Random

val lapisJsonFactory: JsonFactory = JsonFactory()

/**
 * Tabular LAPIS result. [columns] are in JSON key order; [csvColumnOrder] (indices into [columns]) is the
 * column order of CSV/TSV output (differs for /aggregated, where CSV puts count last).
 */
class TableShape(val columns: List<String>, val csvColumnOrder: IntArray = IntArray(columns.size) { it })

/** values of a table row: String, Long/Int, Double, Boolean or null, in [TableShape.columns] order */
typealias Row = Array<Any?>

// ---------------- ordering pipeline ----------------

/** compares LAPIS values; null is smallest */
object LapisValueComparator : Comparator<Any?> {
    override fun compare(a: Any?, b: Any?): Int = when {
        a === b -> 0
        a == null -> -1
        b == null -> 1
        a is String && b is String -> a.compareTo(b)
        a is Long && b is Long -> a.compareTo(b)
        a is Int && b is Int -> a.compareTo(b)
        a is Number && b is Number -> a.toDouble().compareTo(b.toDouble())
        a is Boolean && b is Boolean -> a.compareTo(b)
        else -> a.toString().compareTo(b.toString())
    }
}

fun orderByNotContainedError(field: String, allowed: List<String>) = QueryBadRequestException(
    "Error from SILO: OrderByField $field is not contained in the result of this operation. " +
        "Allowed values are ${allowed.joinToString(", ")}.",
)

/** throws the SILO error if an orderBy field is not in [allowed] */
fun validateOrderBy(orderBy: List<OrderByField>, allowed: List<String>) {
    orderBy.firstOrNull { it.field !in allowed }?.let { throw orderByNotContainedError(it.field, allowed) }
}

/**
 * The SILO result pipeline: stable sort by [orderBy] (columns of [columns]) -> offset -> shuffle (random) -> limit.
 */
fun applyPipeline(
    rows: List<Row>,
    columns: List<String>,
    orderBy: List<OrderByField>,
    random: RandomOrder?,
    offset: Int,
    limit: Int?,
): List<Row> {
    var result = rows
    if (orderBy.isNotEmpty()) {
        val comparators = orderBy.map { field ->
            val index = columns.indexOf(field.field)
            require(index >= 0) { "unknown order by column ${field.field}" }
            val c = Comparator<Row> { a, b -> LapisValueComparator.compare(a[index], b[index]) }
            if (field.direction == OrderDirection.DESCENDING) c.reversed() else c
        }
        result = result.sortedWith(comparators.reduce { acc, c -> acc.then(c) })
    }
    if (offset > 0) result = result.drop(offset)
    if (random != null) result = result.shuffled(Random(random.seed ?: System.nanoTime()))
    if (limit != null) result = result.take(limit)
    return result
}

// ---------------- writers ----------------

/**
 * A table output format, split so that rows can be rendered in chunks on several threads:
 * [header] and [trailer] are written once, [render] turns a chunk of rows into bytes (thread-safe, no shared
 * state), [writeChunk] appends a rendered chunk (called in order, on one thread).
 */
abstract class TableFormat(val shape: TableShape) {
    open fun header(out: OutputStream) {}

    abstract fun render(rows: List<Row>): ByteArray

    open fun writeChunk(out: OutputStream, chunk: ByteArray) = out.write(chunk)

    open fun trailer(out: OutputStream) {}
}

fun tableFormat(format: DataFormat, shape: TableShape, envelope: Boolean, info: () -> LapisInfo): TableFormat =
    when (format) {
        DataFormat.JSON -> JsonTableFormat(shape, envelope, info)

        DataFormat.CSV -> CsvTableFormat(shape, CSV_FORMAT, withHeader = true)

        DataFormat.CSV_WITHOUT_HEADERS -> CsvTableFormat(shape, CSV_FORMAT, withHeader = false)

        DataFormat.TSV -> CsvTableFormat(shape, TSV_FORMAT, withHeader = true)

        DataFormat.TSV_ESCAPED -> EscapedTsvTableFormat(shape)

        DataFormat.FASTA, DataFormat.NDJSON -> throw QueryBadRequestException(
            "Data format ${format.name.lowercase()} is not supported for this endpoint",
        )
    }

interface TableWriter {
    fun start()

    fun row(values: Row)

    /** writes the trailer (JSON info) and flushes; does not close the underlying stream */
    fun finish()
}

/** row-by-row writing on top of a [TableFormat] */
fun tableWriter(
    format: DataFormat,
    shape: TableShape,
    out: OutputStream,
    envelope: Boolean,
    info: () -> LapisInfo,
): TableWriter {
    val tableFormat = tableFormat(format, shape, envelope, info)
    return object : TableWriter {
        private val buffer = ArrayList<Row>(ROWS_PER_CHUNK)

        override fun start() = tableFormat.header(out)

        override fun row(values: Row) {
            buffer.add(values)
            if (buffer.size >= ROWS_PER_CHUNK) flush()
        }

        private fun flush() {
            if (buffer.isEmpty()) return
            tableFormat.writeChunk(out, tableFormat.render(buffer))
            buffer.clear()
        }

        override fun finish() {
            flush()
            tableFormat.trailer(out)
            out.flush()
        }
    }
}

private const val ROWS_PER_CHUNK = 1024

/** like LAPIS: commons-csv DEFAULT with "\n" record separator */
val CSV_FORMAT: CSVFormat = CSVFormat.DEFAULT.builder().setRecordSeparator("\n").get()
val TSV_FORMAT: CSVFormat = CSVFormat.DEFAULT.builder().setRecordSeparator("\n").setDelimiter('\t').get()

class JsonTableFormat(shape: TableShape, private val envelope: Boolean, private val info: () -> LapisInfo) :
    TableFormat(shape) {
    private var wroteRows = false

    override fun header(out: OutputStream) {
        out.write((if (envelope) "{\"data\":[" else "[").toByteArray())
    }

    override fun render(rows: List<Row>): ByteArray {
        val buffer = ByteArrayOutputStream(rows.size * 256)
        lapisJsonFactory.createGenerator(buffer, JsonEncoding.UTF8).use { generator ->
            generator.setRootValueSeparator(SerializedString(","))
            for (row in rows) {
                generator.writeStartObject()
                for (i in shape.columns.indices) {
                    generator.writeFieldName(shape.columns[i])
                    writeJsonValue(generator, row[i])
                }
                generator.writeEndObject()
            }
        }
        return buffer.toByteArray()
    }

    override fun writeChunk(out: OutputStream, chunk: ByteArray) {
        if (chunk.isEmpty()) return
        if (wroteRows) out.write(','.code)
        out.write(chunk)
        wroteRows = true
    }

    override fun trailer(out: OutputStream) {
        out.write(']'.code)
        if (envelope) {
            out.write(",\"info\":".toByteArray())
            lapisJsonFactory.createGenerator(out, JsonEncoding.UTF8)
                .disable(JsonGenerator.Feature.AUTO_CLOSE_TARGET)
                .use { info().write(it) }
            out.write('}'.code)
        }
    }
}

fun writeJsonValue(generator: JsonGenerator, value: Any?) {
    when (value) {
        null -> generator.writeNull()
        is String -> generator.writeString(value)
        is Long -> generator.writeNumber(value)
        is Int -> generator.writeNumber(value)
        is Double -> generator.writeNumber(value)
        is Float -> generator.writeNumber(value)
        is Boolean -> generator.writeBoolean(value)
        is Char -> generator.writeString(value.toString())
        else -> generator.writeString(value.toString())
    }
}

/** the text of a value in CSV / TSV / FASTA headers */
fun textValue(value: Any?): String? = when (value) {
    null -> null
    is String -> value
    else -> value.toString()
}

class CsvTableFormat(shape: TableShape, private val format: CSVFormat, private val withHeader: Boolean) :
    TableFormat(shape) {
    override fun header(out: OutputStream) {
        if (!withHeader) return
        val sb = StringBuilder()
        CSVPrinter(sb, format).printRecord(shape.csvColumnOrder.map { shape.columns[it] })
        out.write(sb.toString().toByteArray(Charsets.UTF_8))
    }

    override fun render(rows: List<Row>): ByteArray {
        val sb = StringBuilder(rows.size * 128)
        val printer = CSVPrinter(sb, format)
        val cells = arrayOfNulls<String>(shape.columns.size)
        for (row in rows) {
            for (i in cells.indices) cells[i] = textValue(row[shape.csvColumnOrder[i]])
            printer.printRecord(*cells)
        }
        return sb.toString().toByteArray(Charsets.UTF_8)
    }
}

/** tsv-escaped: no quoting, newlines and tabs within values escaped as \n and \t */
class EscapedTsvTableFormat(shape: TableShape) : TableFormat(shape) {
    override fun header(out: OutputStream) {
        val sb = StringBuilder()
        appendLine(sb, shape.csvColumnOrder.map { shape.columns[it] })
        out.write(sb.toString().toByteArray(Charsets.UTF_8))
    }

    override fun render(rows: List<Row>): ByteArray {
        val sb = StringBuilder(rows.size * 128)
        for (row in rows) appendLine(sb, shape.csvColumnOrder.map { textValue(row[it]) })
        return sb.toString().toByteArray(Charsets.UTF_8)
    }

    private fun appendLine(sb: StringBuilder, cells: List<String?>) {
        cells.forEachIndexed { i, cell ->
            if (i > 0) sb.append('\t')
            if (cell != null) sb.append(escapeTsv(cell))
        }
        sb.append('\n')
    }

    companion object {
        fun escapeTsv(value: String): String = if (value.indexOf('\n') < 0 && value.indexOf('\t') < 0) {
            value
        } else {
            value.replace("\n", "\\n").replace("\t", "\\t")
        }
    }
}
