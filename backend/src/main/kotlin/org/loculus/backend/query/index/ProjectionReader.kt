package org.loculus.backend.query.index

import com.fasterxml.jackson.core.JsonFactory
import com.fasterxml.jackson.core.JsonToken
import org.loculus.backend.query.schema.QuerySchema
import java.nio.ByteBuffer
import java.sql.Connection
import java.sql.ResultSet

/**
 * Reads projection rows (query_entries + query_mutation_data) as [IndexRow]s with plain JDBC.
 * Arrays are transferred with `array_send` (binary) and decoded here, which avoids pgjdbc's text parsing
 * and boxing of ~200 array elements per row.
 */
internal class ProjectionReader(private val schema: QuerySchema) {
    private val jsonFactory = JsonFactory()
    private val fieldIndex: Map<String, Int> = schema.metadata.withIndex().associate { (i, f) -> f.name to i }

    fun streamAll(connection: Connection, fetchSize: Int = 5000, consumer: (IndexRow) -> Unit) {
        connection.prepareStatement("$SELECT where e.organism = ? order by e.id").use { statement ->
            statement.fetchSize = fetchSize
            statement.setString(1, schema.organism)
            statement.executeQuery().use { rs -> while (rs.next()) consumer(readRow(rs)) }
        }
    }

    fun readIds(connection: Connection, ids: Collection<Int>): List<IndexRow> {
        if (ids.isEmpty()) return emptyList()
        val result = ArrayList<IndexRow>(ids.size)
        connection.prepareStatement("$SELECT where e.organism = ? and e.id = any(?) order by e.id").use { statement ->
            statement.setString(1, schema.organism)
            statement.setArray(2, connection.createArrayOf("int4", ids.toTypedArray()))
            statement.executeQuery().use { rs -> while (rs.next()) result.add(readRow(rs)) }
        }
        return result
    }

    private fun readRow(rs: ResultSet): IndexRow {
        val id = rs.getInt(1)
        val values = parseMetadata(rs.getString(2))
        return IndexRow(
            id = id,
            values = values,
            presentSequences = PgBinaryArrays.intArray(rs.getBytes(3)),
            mutations = PgBinaryArrays.intArray(rs.getBytes(4)),
            missing = PgBinaryArrays.intArray(rs.getBytes(5)),
            insertions = PgBinaryArrays.textArray(rs.getBytes(6)),
        )
    }

    fun parseMetadata(json: String?): Array<Any?> {
        val values = arrayOfNulls<Any?>(schema.metadata.size)
        if (json == null) return values
        jsonFactory.createParser(json).use { parser ->
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
        private const val SELECT = """
            select e.id, e.metadata::text, array_send(m.present_sequences), array_send(m.mutations),
                   array_send(m.missing), array_send(m.insertions)
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
