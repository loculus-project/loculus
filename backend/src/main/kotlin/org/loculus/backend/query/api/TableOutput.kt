package org.loculus.backend.query.api

import com.fasterxml.jackson.core.JsonEncoding
import com.fasterxml.jackson.core.JsonFactory
import com.fasterxml.jackson.core.JsonGenerator
import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVPrinter
import org.loculus.backend.query.request.DataFormat
import org.loculus.backend.query.request.OrderByField
import org.loculus.backend.query.request.OrderDirection
import org.loculus.backend.query.request.QueryBadRequestException
import org.loculus.backend.query.request.RandomOrder
import java.io.BufferedWriter
import java.io.OutputStream
import java.io.OutputStreamWriter
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

interface TableWriter {
    fun start()

    fun row(values: Row)

    /** writes the trailer (JSON info) and flushes; does not close the underlying stream */
    fun finish()
}

fun tableWriter(
    format: DataFormat,
    shape: TableShape,
    out: OutputStream,
    envelope: Boolean,
    info: () -> LapisInfo,
): TableWriter = when (format) {
    DataFormat.JSON -> JsonTableWriter(shape, out, envelope, info)

    DataFormat.CSV -> CsvTableWriter(shape, out, CSV_FORMAT, withHeader = true)

    DataFormat.CSV_WITHOUT_HEADERS -> CsvTableWriter(shape, out, CSV_FORMAT, withHeader = false)

    DataFormat.TSV -> CsvTableWriter(shape, out, TSV_FORMAT, withHeader = true)

    DataFormat.TSV_ESCAPED -> EscapedTsvTableWriter(shape, out)

    DataFormat.FASTA, DataFormat.NDJSON -> throw QueryBadRequestException(
        "Data format ${format.name.lowercase()} is not supported for this endpoint",
    )
}

/** like LAPIS: commons-csv DEFAULT with "\n" record separator */
val CSV_FORMAT: CSVFormat = CSVFormat.DEFAULT.builder().setRecordSeparator("\n").get()
val TSV_FORMAT: CSVFormat = CSVFormat.DEFAULT.builder().setRecordSeparator("\n").setDelimiter('\t').get()

class JsonTableWriter(
    private val shape: TableShape,
    out: OutputStream,
    private val envelope: Boolean,
    private val info: () -> LapisInfo,
) : TableWriter {
    private val generator: JsonGenerator = lapisJsonFactory.createGenerator(out, JsonEncoding.UTF8)
        .disable(JsonGenerator.Feature.AUTO_CLOSE_TARGET)

    override fun start() {
        if (envelope) {
            generator.writeStartObject()
            generator.writeFieldName("data")
        }
        generator.writeStartArray()
    }

    override fun row(values: Row) {
        generator.writeStartObject()
        for (i in shape.columns.indices) {
            generator.writeFieldName(shape.columns[i])
            writeJsonValue(generator, values[i])
        }
        generator.writeEndObject()
    }

    override fun finish() {
        generator.writeEndArray()
        if (envelope) {
            generator.writeFieldName("info")
            info().write(generator)
            generator.writeEndObject()
        }
        generator.flush()
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

class CsvTableWriter(
    private val shape: TableShape,
    out: OutputStream,
    format: CSVFormat,
    private val withHeader: Boolean,
) : TableWriter {
    private val writer = BufferedWriter(OutputStreamWriter(out, Charsets.UTF_8), 64 * 1024)
    private val printer = CSVPrinter(writer, format)
    private val cells = arrayOfNulls<String>(shape.columns.size)

    override fun start() {
        if (withHeader) printer.printRecord(shape.csvColumnOrder.map { shape.columns[it] })
    }

    override fun row(values: Row) {
        for (i in cells.indices) cells[i] = textValue(values[shape.csvColumnOrder[i]])
        printer.printRecord(*cells)
    }

    override fun finish() {
        printer.flush()
        writer.flush()
    }
}

/** tsv-escaped: no quoting, newlines and tabs within values escaped as \n and \t */
class EscapedTsvTableWriter(private val shape: TableShape, out: OutputStream) : TableWriter {
    private val writer = BufferedWriter(OutputStreamWriter(out, Charsets.UTF_8), 64 * 1024)

    override fun start() {
        writeLine(shape.csvColumnOrder.map { shape.columns[it] })
    }

    override fun row(values: Row) {
        writeLine(shape.csvColumnOrder.map { textValue(values[it]) })
    }

    private fun writeLine(cells: List<String?>) {
        cells.forEachIndexed { i, cell ->
            if (i > 0) writer.write('\t'.code)
            if (cell != null) writer.write(escapeTsv(cell))
        }
        writer.write('\n'.code)
    }

    override fun finish() {
        writer.flush()
    }

    companion object {
        fun escapeTsv(value: String): String = if (value.indexOf('\n') < 0 && value.indexOf('\t') < 0) {
            value
        } else {
            value.replace("\n", "\\n").replace("\t", "\\t")
        }
    }
}
