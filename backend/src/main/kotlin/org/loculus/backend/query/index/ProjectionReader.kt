package org.loculus.backend.query.index

import com.fasterxml.jackson.core.JsonFactory
import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.core.JsonToken
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.store.StoredMetadata
import org.loculus.backend.query.store.StoredMetadataReader
import org.loculus.backend.query.store.ZstdDictionaryCache
import java.nio.ByteBuffer
import java.sql.Connection
import java.sql.ResultSet

/**
 * Reads projection rows (query_entries + query_mutation_data) as [IndexRow]s with plain JDBC.
 * Arrays are transferred with `array_send` (binary) and decoded here, which avoids pgjdbc's text parsing
 * and boxing of ~200 array elements per row.
 */
internal class ProjectionReader(private val schema: QuerySchema, private val dictionaries: ZstdDictionaryCache) {
    private val jsonFactory = JsonFactory()
    private val fieldIndex: Map<String, Int> = schema.metadata.withIndex().associate { (i, f) -> f.name to i }

    fun streamAll(connection: Connection, fetchSize: Int = 5000, consumer: (IndexRow) -> Unit) {
        connection.prepareStatement("$SELECT where e.organism = ? order by e.id").use { statement ->
            statement.fetchSize = fetchSize
            statement.setString(1, schema.organism)
            statement.executeQuery().use { rs -> readRows(rs, consumer) }
        }
    }

    /** rows with fromId <= id <= toId in id order */
    fun streamRange(
        connection: Connection,
        fromId: Int,
        toId: Int,
        fetchSize: Int = 5000,
        consumer: (IndexRow) -> Unit,
    ) {
        connection.prepareStatement(
            "$SELECT where e.organism = ? and e.id between ? and ? order by e.id",
        ).use { statement ->
            statement.fetchSize = fetchSize
            statement.setString(1, schema.organism)
            statement.setInt(2, fromId)
            statement.setInt(3, toId)
            statement.executeQuery().use { rs -> readRows(rs, consumer) }
        }
    }

    fun readIds(connection: Connection, ids: Collection<Int>): List<IndexRow> {
        if (ids.isEmpty()) return emptyList()
        val result = ArrayList<IndexRow>(ids.size)
        connection.prepareStatement("$SELECT where e.organism = ? and e.id = any(?) order by e.id").use { statement ->
            statement.setString(1, schema.organism)
            statement.setArray(2, connection.createArrayOf("int4", ids.toTypedArray()))
            statement.executeQuery().use { rs -> readRows(rs) { result.add(it) } }
        }
        return result
    }

    private fun readRows(rs: ResultSet, consumer: (IndexRow) -> Unit) {
        StoredMetadataReader(dictionaries).use { metadata ->
            while (rs.next()) {
                val values = if (metadata.read(rs, 2)) {
                    parseMetadata(jsonFactory.createParser(metadata.bytes, 0, metadata.length))
                } else {
                    arrayOfNulls(schema.metadata.size)
                }
                consumer(
                    IndexRow(
                        id = rs.getInt(1),
                        values = values,
                        presentSequences = PgBinaryArrays.intArray(rs.getBytes(5)),
                        mutations = PgBinaryArrays.intArray(rs.getBytes(6)),
                        missing = PgBinaryArrays.intArray(rs.getBytes(7)),
                        insertions = PgBinaryArrays.textArray(rs.getBytes(8)),
                    ),
                )
            }
        }
    }

    /** a missing key and a JSON null both leave the value null (stored records have no null-valued keys) */
    fun parseMetadata(json: String?): Array<Any?> =
        if (json == null) arrayOfNulls(schema.metadata.size) else parseMetadata(jsonFactory.createParser(json))

    private fun parseMetadata(jsonParser: JsonParser): Array<Any?> {
        val values = arrayOfNulls<Any?>(schema.metadata.size)
        jsonParser.use { parser ->
            if (parser.nextToken() != JsonToken.START_OBJECT) return values
            while (parser.nextToken() == JsonToken.FIELD_NAME) {
                val index = fieldIndex[parser.currentName()]
                val token = parser.nextToken()
                if (index == null) {
                    parser.skipChildren()
                    continue
                }
                values[index] = when (token) {
                    JsonToken.VALUE_STRING -> parser.text

                    JsonToken.VALUE_NUMBER_INT -> parser.longValue

                    JsonToken.VALUE_NUMBER_FLOAT -> parser.doubleValue

                    JsonToken.VALUE_TRUE -> true

                    JsonToken.VALUE_FALSE -> false

                    JsonToken.START_OBJECT, JsonToken.START_ARRAY -> {
                        parser.skipChildren()
                        null
                    }

                    else -> null
                }
            }
        }
        return values
    }

    companion object {
        private val SELECT = """
            select e.id, ${StoredMetadata.select("e")}, array_send(m.present_sequences),
                   array_send(m.mutations), array_send(m.missing), array_send(m.insertions)
            from query_entries e
            left join query_mutation_data m on m.organism = e.organism and m.id = e.id
        """
    }
}

/** decoder for the Postgres binary array format (array_send) of one-dimensional int4[] / text[] */
internal object PgBinaryArrays {
    fun intArray(bytes: ByteArray?): IntArray {
        if (bytes == null) return IntArray(0)
        val buffer = ByteBuffer.wrap(bytes)
        val dims = buffer.getInt()
        if (dims == 0) return IntArray(0)
        require(dims == 1) { "expected a one-dimensional array" }
        buffer.getInt() // has nulls
        buffer.getInt() // element type oid
        val size = buffer.getInt()
        buffer.getInt() // lower bound
        val result = IntArray(size)
        var n = 0
        for (i in 0 until size) {
            val length = buffer.getInt()
            if (length < 0) continue
            result[n++] = buffer.getInt()
        }
        return if (n == size) result else result.copyOf(n)
    }

    fun textArray(bytes: ByteArray?): List<String> {
        if (bytes == null) return emptyList()
        val buffer = ByteBuffer.wrap(bytes)
        val dims = buffer.getInt()
        if (dims == 0) return emptyList()
        require(dims == 1) { "expected a one-dimensional array" }
        buffer.getInt()
        buffer.getInt()
        val size = buffer.getInt()
        buffer.getInt()
        val result = ArrayList<String>(size)
        for (i in 0 until size) {
            val length = buffer.getInt()
            if (length < 0) continue
            result.add(String(bytes, buffer.position(), length, Charsets.UTF_8))
            buffer.position(buffer.position() + length)
        }
        return result
    }
}
