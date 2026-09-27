package org.loculus.backend.query.api

import com.fasterxml.jackson.core.JsonEncoding
import com.fasterxml.jackson.core.JsonGenerator
import org.loculus.backend.query.request.QueryBadRequestException
import org.loculus.backend.query.schema.QuerySchema
import java.io.OutputStream

/**
 * A parsed FASTA header template: `{field}` placeholders (case-insensitive metadata field names) and
 * `{.segment}` / `{.gene}` (the name of the sequence). Unknown placeholders are rejected.
 */
class FastaHeaderTemplate private constructor(private val parts: List<Part>) {
    sealed interface Part

    data class Literal(val text: String) : Part

    /** [fieldIndex] = index into [fields] */
    data class Field(val fieldIndex: Int) : Part

    data object SequenceName : Part

    /** canonical metadata fields referenced by the template (in first-use order) */
    var fields: List<String> = emptyList()
        private set

    /** renders the header; [values] are the texts of [fields] (null -> empty) */
    fun render(values: Array<String?>?, sequenceName: String): String {
        val sb = StringBuilder(64)
        for (part in parts) {
            when (part) {
                is Literal -> sb.append(part.text)
                is Field -> values?.get(part.fieldIndex)?.let { sb.append(it) }
                SequenceName -> sb.append(sequenceName)
            }
        }
        return sb.toString()
    }

    companion object {
        private val PLACEHOLDER = Regex("""\{([^}]+)}""")

        fun parse(template: String, schema: QuerySchema): FastaHeaderTemplate {
            val parts = mutableListOf<Part>()
            val fields = mutableListOf<String>()
            var last = 0
            for (match in PLACEHOLDER.findAll(template)) {
                if (match.range.first > last) parts.add(Literal(template.substring(last, match.range.first)))
                val name = match.groupValues[1]
                val lower = name.lowercase()
                if (lower == ".segment" || lower == ".gene") {
                    parts.add(SequenceName)
                } else {
                    val field = schema.field(name)?.name ?: throw QueryBadRequestException(
                        "Invalid FASTA header template: '$name' is not a valid metadata field. " +
                            "Available fields: ${schema.metadata.joinToString(", ") { it.name }}",
                    )
                    var index = fields.indexOf(field)
                    if (index < 0) {
                        fields.add(field)
                        index = fields.size - 1
                    }
                    parts.add(Field(index))
                }
                last = match.range.last + 1
            }
            if (last < template.length) parts.add(Literal(template.substring(last)))
            return FastaHeaderTemplate(parts).also { it.fields = fields }
        }
    }
}

/** Writes sequences in one of the LAPIS sequence formats. Rows are started/ended by the caller. */
interface SequenceWriter {
    fun start()

    /**
     * one output row: [key] is the primary key value (typed), [headerValues] the texts of the template fields,
     * [sequences] per requested slot (null = no sequence).
     */
    fun row(key: Any?, headerValues: Array<String?>?, sequences: Array<ByteArray?>, lengths: IntArray)

    fun finish()
}

class FastaWriter(
    private val out: OutputStream,
    private val template: FastaHeaderTemplate,
    private val sequenceNames: List<String>,
) : SequenceWriter {
    override fun start() {}

    override fun row(key: Any?, headerValues: Array<String?>?, sequences: Array<ByteArray?>, lengths: IntArray) {
        for (slot in sequences.indices) {
            val sequence = sequences[slot] ?: continue
            write(headerValues, slot, sequence, lengths[slot])
        }
    }

    /** writes a single FASTA record directly (without copying the sequence) */
    fun write(headerValues: Array<String?>?, slot: Int, sequence: ByteArray, length: Int) {
        out.write('>'.code)
        out.write(template.render(headerValues, sequenceNames[slot]).toByteArray(Charsets.UTF_8))
        out.write('\n'.code)
        out.write(sequence, 0, length)
        out.write('\n'.code)
    }

    override fun finish() {
        out.flush()
    }
}

/** JSON array or NDJSON of `{"<primaryKey>": ..., "<sequenceName>": "..." | null, ...}` */
class JsonSequenceWriter(
    out: OutputStream,
    private val primaryKey: String,
    private val sequenceNames: List<String>,
    private val ndjson: Boolean,
) : SequenceWriter {
    private val generator: JsonGenerator = lapisJsonFactory.createGenerator(out, JsonEncoding.UTF8)
        .disable(JsonGenerator.Feature.AUTO_CLOSE_TARGET)
        .also { if (ndjson) it.setRootValueSeparator(null) }

    override fun start() {
        if (!ndjson) generator.writeStartArray()
    }

    override fun row(key: Any?, headerValues: Array<String?>?, sequences: Array<ByteArray?>, lengths: IntArray) {
        generator.writeStartObject()
        generator.writeFieldName(primaryKey)
        writeJsonValue(generator, key)
        for (slot in sequences.indices) {
            generator.writeFieldName(sequenceNames[slot])
            val sequence = sequences[slot]
            if (sequence == null) generator.writeNull() else generator.writeUTF8String(sequence, 0, lengths[slot])
        }
        generator.writeEndObject()
        if (ndjson) generator.writeRaw('\n')
    }

    override fun finish() {
        if (!ndjson) generator.writeEndArray()
        generator.flush()
    }
}
