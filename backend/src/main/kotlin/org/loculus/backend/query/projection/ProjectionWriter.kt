package org.loculus.backend.query.projection

import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.store.SequenceKind
import org.postgresql.PGConnection
import java.io.StringReader
import java.sql.Connection

/** A projected entry with its assigned id; [isNew] if the id was just allocated (no rows exist for it yet). */
class IdentifiedEntry(val id: Int, val isNew: Boolean, val entry: ProjectedEntry)

/**
 * Writes projection rows of one organism on a JDBC connection that is inside a transaction (the caller commits).
 *
 * Rows are COPYed (CSV) into temporary staging tables and then upserted with `insert ... on conflict do update
 * where <row changed>`, so that only ids whose rows actually changed end up in query_changelog.
 */
class ProjectionWriter(private val schema: QuerySchema) {
    private val organism = schema.organism

    /** all (kind, sequence_index) pairs that may exist for this organism */
    private val sequenceSlots: List<Pair<Short, Short>> =
        schema.nucleotideSequences.flatMap {
            listOf(
                SequenceKind.UNALIGNED_NUCLEOTIDE.code to it.index.toShort(),
                SequenceKind.ALIGNED_NUCLEOTIDE.code to it.index.toShort(),
            )
        } + schema.genes.map { SequenceKind.ALIGNED_AMINO_ACID.code to it.index.toShort() }

    /**
     * Upserts [entries], deletes all rows of [deletedIds], writes query_changelog rows for every id whose rows
     * changed and bumps query_engine_state.data_version if anything changed.
     *
     * @return the number of changed ids
     */
    fun write(connection: Connection, entries: List<IdentifiedEntry>, deletedIds: Collection<Int>): Int {
        val changed = HashSet<Int>()
        val (newEntries, existingEntries) = entries.partition { it.isNew }
        if (newEntries.isNotEmpty()) {
            // freshly allocated ids have no rows yet: COPY straight into the projection tables
            copyRows(connection, newEntries, direct = true)
            newEntries.forEach { changed.add(it.id) }
        }
        if (existingEntries.isNotEmpty()) {
            createStagingTables(connection)
            copyRows(connection, existingEntries, direct = false)
            changed += upsert(connection)
            // entries with unchanged sequence data keep their query_mutation_data / query_sequences rows untouched
            val sequenceDataChanged = existingEntries.filter { !it.entry.sequenceDataUnchanged }.map { it.id }
            if (sequenceDataChanged.isNotEmpty()) {
                changed += deleteSequences(connection, sequenceDataChanged, onlyStale = true)
            }
        }
        if (deletedIds.isNotEmpty()) {
            changed += deleteIds(connection, "query_entries", deletedIds)
            changed += deleteIds(connection, "query_mutation_data", deletedIds)
            changed += deleteSequences(connection, deletedIds.toList(), onlyStale = false)
        }
        if (changed.isNotEmpty()) recordChanges(connection, changed)
        return changed.size
    }

    private fun createStagingTables(connection: Connection) {
        connection.createStatement().use { statement ->
            statement.execute(
                """
                create temp table if not exists query_stage_entries (
                    id integer, accession text, version bigint, accession_version text, metadata jsonb,
                    source_hash bigint
                ) on commit delete rows;
                create temp table if not exists query_stage_mutation_data (
                    id integer, present_sequences integer[], mutations integer[], missing integer[], insertions text[]
                ) on commit delete rows;
                create temp table if not exists query_stage_sequences (
                    kind smallint, sequence_index smallint, id integer, compression_dict_id integer, data bytea
                ) on commit delete rows;
                """.trimIndent(),
            )
        }
    }

    /**
     * COPY [entries] into the projection tables ([direct]) or into the staging tables. Sequence-derived rows are
     * only written for entries whose sequence data changed.
     */
    private fun copyRows(connection: Connection, entries: List<IdentifiedEntry>, direct: Boolean) {
        val copyApi = connection.unwrap(PGConnection::class.java).copyAPI
        val prefix = if (direct) appendCsvText(StringBuilder(), organism).append(',').toString() else ""
        val (entriesTable, mutationTable, sequencesTable) = if (direct) {
            Triple("query_entries", "query_mutation_data", "query_sequences")
        } else {
            Triple("query_stage_entries", "query_stage_mutation_data", "query_stage_sequences")
        }
        val organismColumn = if (direct) "organism, " else ""

        val entriesCsv = StringBuilder(entries.size * 1024)
        val mutationCsv = StringBuilder(entries.size * 2048)
        val sequencesCsv = StringBuilder(entries.size * 2048)
        for (identified in entries) {
            val id = identified.id
            val e = identified.entry
            entriesCsv.append(prefix).append(id).append(',')
            appendCsvText(entriesCsv, e.accession).append(',').append(e.version).append(',')
            appendCsvText(entriesCsv, e.accessionVersion).append(',')
            appendCsvText(entriesCsv, e.metadataJson).append(',').append(e.sourceHash).append('\n')

            if (e.sequenceDataUnchanged) {
                check(!direct) { "new entry ${e.accessionVersion} without sequence data" }
                continue
            }
            mutationCsv.append(prefix).append(id).append(',')
            appendIntArray(mutationCsv, e.presentSequences).append(',')
            appendIntArray(mutationCsv, e.mutations).append(',')
            appendIntArray(mutationCsv, e.missing).append(',')
            appendTextArray(mutationCsv, e.insertions).append('\n')

            for (s in e.sequences) {
                sequencesCsv.append(prefix)
                sequencesCsv.append(s.kind.code).append(',').append(s.sequenceIndex).append(',').append(id).append(',')
                s.compressionDictId?.let { sequencesCsv.append(it) }
                sequencesCsv.append(',')
                appendHex(sequencesCsv, s.data).append('\n')
            }
        }
        copyApi.copyIn(
            "copy $entriesTable (${organismColumn}id, accession, version, accession_version, metadata, source_hash) " +
                "from stdin (format csv)",
            StringReader(entriesCsv.toString()),
        )
        if (mutationCsv.isNotEmpty()) {
            copyApi.copyIn(
                "copy $mutationTable (${organismColumn}id, present_sequences, mutations, missing, insertions) " +
                    "from stdin (format csv)",
                StringReader(mutationCsv.toString()),
            )
        }
        if (sequencesCsv.isNotEmpty()) {
            copyApi.copyIn(
                "copy $sequencesTable (${organismColumn}kind, sequence_index, id, compression_dict_id, data) " +
                    "from stdin (format csv)",
                StringReader(sequencesCsv.toString()),
            )
        }
    }

    private fun upsert(connection: Connection): Set<Int> {
        val changed = HashSet<Int>()
        changed += queryIds(
            connection,
            """
            insert into query_entries as t
                (organism, id, accession, version, accession_version, metadata, source_hash)
            select ?, id, accession, version, accession_version, metadata, source_hash from query_stage_entries
            on conflict (organism, id) do update set
                accession = excluded.accession,
                version = excluded.version,
                accession_version = excluded.accession_version,
                metadata = excluded.metadata,
                source_hash = excluded.source_hash
            where (t.accession, t.version, t.accession_version, t.metadata, t.source_hash)
                is distinct from
                (excluded.accession, excluded.version, excluded.accession_version, excluded.metadata,
                    excluded.source_hash)
            returning t.id
            """.trimIndent(),
        )
        changed += queryIds(
            connection,
            """
            insert into query_mutation_data as t (organism, id, present_sequences, mutations, missing, insertions)
            select ?, id, present_sequences, mutations, missing, insertions from query_stage_mutation_data
            on conflict (organism, id) do update set
                present_sequences = excluded.present_sequences,
                mutations = excluded.mutations,
                missing = excluded.missing,
                insertions = excluded.insertions
            where (t.present_sequences, t.mutations, t.missing, t.insertions)
                is distinct from (excluded.present_sequences, excluded.mutations, excluded.missing, excluded.insertions)
            returning t.id
            """.trimIndent(),
        )
        changed += queryIds(
            connection,
            """
            insert into query_sequences as t (organism, kind, sequence_index, id, compression_dict_id, data)
            select ?, kind, sequence_index, id, compression_dict_id, data from query_stage_sequences
            on conflict (organism, kind, sequence_index, id) do update set
                compression_dict_id = excluded.compression_dict_id,
                data = excluded.data
            where (t.compression_dict_id, t.data) is distinct from (excluded.compression_dict_id, excluded.data)
            returning t.id
            """.trimIndent(),
        )
        return changed
    }

    private fun queryIds(connection: Connection, sql: String): List<Int> = connection.prepareStatement(sql).use {
        it.setString(1, organism)
        it.executeQuery().use { rs ->
            val ids = ArrayList<Int>()
            while (rs.next()) ids.add(rs.getInt(1))
            ids
        }
    }

    private fun deleteIds(connection: Connection, table: String, ids: Collection<Int>): List<Int> =
        connection.prepareStatement("delete from $table where organism = ? and id = any(?) returning id").use {
            it.setString(1, organism)
            it.setArray(2, connection.createArrayOf("integer", ids.toTypedArray()))
            it.executeQuery().use { rs ->
                val result = ArrayList<Int>()
                while (rs.next()) result.add(rs.getInt(1))
                result
            }
        }

    /**
     * Deletes query_sequences rows of [ids] (only those not in the staging table if [onlyStale]).
     * One statement per (kind, sequence_index) slot, each an index scan on the primary key (a join with unnested
     * arrays may be planned as a sequential scan of the whole table).
     */
    private fun deleteSequences(connection: Connection, ids: List<Int>, onlyStale: Boolean): List<Int> {
        val staleCondition = if (onlyStale) {
            """
            and not exists (
                select 1 from query_stage_sequences s
                where s.id = t.id and s.kind = t.kind and s.sequence_index = t.sequence_index
            )
            """.trimIndent()
        } else {
            ""
        }
        val sql = """
            delete from query_sequences t
            where t.organism = ? and t.kind = ? and t.sequence_index = ? and t.id = any(?)
            $staleCondition
            returning t.id
        """.trimIndent()
        val result = ArrayList<Int>()
        connection.prepareStatement(sql).use {
            val idArray = connection.createArrayOf("integer", ids.toTypedArray())
            for ((kind, sequenceIndex) in sequenceSlots) {
                it.setString(1, organism)
                it.setShort(2, kind)
                it.setShort(3, sequenceIndex)
                it.setArray(4, idArray)
                it.executeQuery().use { rs ->
                    while (rs.next()) result.add(rs.getInt(1))
                }
            }
        }
        return result
    }

    private fun recordChanges(connection: Connection, changedIds: Set<Int>) {
        connection.prepareStatement(
            "insert into query_changelog (organism, id) select ?, unnest(?::integer[]) order by 2",
        ).use {
            it.setString(1, organism)
            it.setArray(2, connection.createArrayOf("integer", changedIds.toTypedArray()))
            it.executeUpdate()
        }
        connection.prepareStatement(
            """
            update query_engine_state
            set data_version = greatest(data_version, extract(epoch from now())::bigint),
                updated_at = timezone('UTC', now())
            where organism = ?
            """.trimIndent(),
        ).use {
            it.setString(1, organism)
            it.executeUpdate()
        }
    }

    companion object {
        private val HEX = "0123456789abcdef".toCharArray()

        /** CSV field, always quoted (so that empty strings are not read as NULL) */
        fun appendCsvText(sb: StringBuilder, value: String): StringBuilder {
            sb.append('"')
            for (c in value) {
                if (c == '"') sb.append('"')
                sb.append(c)
            }
            return sb.append('"')
        }

        /** Postgres integer[] literal as quoted CSV field */
        fun appendIntArray(sb: StringBuilder, values: IntArray): StringBuilder {
            sb.append("\"{")
            for (i in values.indices) {
                if (i > 0) sb.append(',')
                sb.append(values[i])
            }
            return sb.append("}\"")
        }

        /** Postgres text[] literal as quoted CSV field */
        fun appendTextArray(sb: StringBuilder, values: List<String>): StringBuilder {
            val literal = StringBuilder("{")
            values.forEachIndexed { i, v ->
                if (i > 0) literal.append(',')
                literal.append('"')
                for (c in v) {
                    if (c == '"' || c == '\\') literal.append('\\')
                    literal.append(c)
                }
                literal.append('"')
            }
            literal.append('}')
            return appendCsvText(sb, literal.toString())
        }

        /** bytea hex format (\x...) */
        fun appendHex(sb: StringBuilder, data: ByteArray): StringBuilder {
            sb.append("\\x")
            for (b in data) {
                val v = b.toInt() and 0xFF
                sb.append(HEX[v ushr 4]).append(HEX[v and 0x0F])
            }
            return sb
        }
    }
}
