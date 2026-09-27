package org.loculus.backend.query.api

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.query.index.InsertionRow
import org.loculus.backend.query.index.MutationRow
import org.loculus.backend.query.request.DataFormat
import org.loculus.backend.query.request.Endpoint
import org.loculus.backend.query.request.OrderByField
import org.loculus.backend.query.request.OrderDirection.ASCENDING
import org.loculus.backend.query.request.OrderDirection.DESCENDING
import org.loculus.backend.query.request.QueryBadRequestException
import org.loculus.backend.query.request.QueryRequest
import org.loculus.backend.query.schema.SequenceType
import java.io.ByteArrayOutputStream

class MutationTablesTest {
    private val single = testSchema()
    private val multi = testSchema(segments = listOf("L", "M"))

    private fun json(table: Table): String {
        val out = ByteArrayOutputStream()
        val writer = tableWriter(DataFormat.JSON, table.shape, out, false) { error("no info") }
        writer.start()
        table.rows.forEach(writer::row)
        writer.finish()
        return out.toString(Charsets.UTF_8)
    }

    private fun csv(table: Table): String {
        val out = ByteArrayOutputStream()
        val writer = tableWriter(DataFormat.CSV, table.shape, out, false) { error("no info") }
        writer.start()
        table.rows.forEach(writer::row)
        writer.finish()
        return out.toString(Charsets.UTF_8)
    }

    private val request = QueryRequest(Endpoint.NUCLEOTIDE_MUTATIONS)

    @Test
    fun `single segment nucleotide mutations`() {
        val rows = listOf(MutationRow(0, 21, 'C', 'T', 6872, 15164))
        val table = MutationTables.mutations(single, SequenceType.NUCLEOTIDE, rows, request)
        assertThat(
            json(table),
            equalTo(
                """[{"mutation":"C21T","count":6872,"coverage":15164,"proportion":0.4531785808493801,""" +
                    """"sequenceName":null,"mutationFrom":"C","mutationTo":"T","position":21}]""",
            ),
        )
        assertThat(
            csv(table),
            equalTo(
                "mutation,count,coverage,proportion,sequenceName,mutationFrom,mutationTo,position\n" +
                    "C21T,6872,15164,0.4531785808493801,,C,T,21\n",
            ),
        )
    }

    @Test
    fun `multi segment and amino acid mutations are prefixed with the sequence name`() {
        val nuc = MutationTables.mutations(
            multi,
            SequenceType.NUCLEOTIDE,
            listOf(MutationRow(1, 5, 'A', '-', 1, 2)),
            request,
        )
        assertThat(nuc.rows.single()[0], equalTo("M:A5-"))
        assertThat(nuc.rows.single()[4], equalTo("M"))

        val aa = MutationTables.mutations(
            single,
            SequenceType.AMINO_ACID,
            listOf(MutationRow(1, 9, 'T', 'I', 1, 2)),
            QueryRequest(Endpoint.AMINO_ACID_MUTATIONS),
        )
        assertThat(aa.rows.single()[0], equalTo("E:T9I"))
        assertThat(aa.rows.single()[4], equalTo("E"))
    }

    @Test
    fun `fields keep the canonical column order`() {
        val rows = listOf(MutationRow(0, 21, 'C', 'T', 6872, 15164))
        val table = MutationTables.mutations(
            single,
            SequenceType.NUCLEOTIDE,
            rows,
            request.copy(fields = listOf("count", "mutation")),
        )
        assertThat(json(table), equalTo("""[{"mutation":"C21T","count":6872}]"""))
    }

    @Test
    fun `orderBy mutation expands to sequenceName, mutationFrom, position, mutationTo`() {
        val rows = listOf(
            MutationRow(1, 10, 'A', 'T', 1, 10),
            MutationRow(0, 10, 'A', 'G', 5, 10),
            MutationRow(0, 3, 'C', 'T', 2, 10),
            MutationRow(0, 10, 'A', 'C', 3, 10),
        )
        val asc = MutationTables.mutations(
            multi,
            SequenceType.NUCLEOTIDE,
            rows,
            request.copy(orderBy = listOf(OrderByField("mutation", ASCENDING))),
        )
        assertThat(asc.rows.map { it[0] }, contains("L:A10C", "L:A10G", "L:C3T", "M:A10T"))

        val byCount = MutationTables.mutations(
            multi,
            SequenceType.NUCLEOTIDE,
            rows,
            request.copy(orderBy = listOf(OrderByField("count", DESCENDING)), offset = 1, limit = 2),
        )
        assertThat(byCount.rows.map { it[0] }, contains("L:A10C", "L:C3T"))
    }

    @Test
    fun `orderBy validation lists the allowed columns like SILO`() {
        val all = assertThrows<QueryBadRequestException> {
            MutationTables.mutations(
                single,
                SequenceType.NUCLEOTIDE,
                emptyList(),
                request.copy(orderBy = listOf(OrderByField("foo", ASCENDING))),
            )
        }
        assertThat(
            all.message,
            equalTo(
                "Error from SILO: OrderByField foo is not contained in the result of this operation. " +
                    "Allowed values are mutationFrom, mutationTo, sequenceName, position, proportion, coverage, count.",
            ),
        )
        val restricted = assertThrows<QueryBadRequestException> {
            MutationTables.mutations(
                single,
                SequenceType.NUCLEOTIDE,
                emptyList(),
                request.copy(
                    fields = listOf("mutation", "count"),
                    orderBy = listOf(OrderByField("proportion", ASCENDING)),
                ),
            )
        }
        assertThat(
            restricted.message,
            equalTo(
                "Error from SILO: OrderByField proportion is not contained in the result of this operation. " +
                    "Allowed values are mutationFrom, mutationTo, sequenceName, position, count.",
            ),
        )
        val insertions = assertThrows<QueryBadRequestException> {
            MutationTables.insertions(
                single,
                SequenceType.NUCLEOTIDE,
                emptyList(),
                QueryRequest(
                    Endpoint.NUCLEOTIDE_INSERTIONS,
                    fields = listOf("count"),
                    orderBy = listOf(OrderByField("foo", ASCENDING)),
                ),
            )
        }
        assertThat(
            insertions.message,
            equalTo(
                "Error from SILO: OrderByField foo is not contained in the result of this operation. " +
                    "Allowed values are position, insertedSymbols, sequenceName, count.",
            ),
        )
    }

    @Test
    fun `insertion formats`() {
        val nucRequest = QueryRequest(Endpoint.NUCLEOTIDE_INSERTIONS)
        val singleNuc = MutationTables.insertions(
            single,
            SequenceType.NUCLEOTIDE,
            listOf(InsertionRow(0, 28168, "TGTC", 89)),
            nucRequest,
        )
        assertThat(
            json(singleNuc),
            equalTo(
                """[{"insertion":"ins_28168:TGTC","count":89,"insertedSymbols":"TGTC","position":28168,"sequenceName":null}]""",
            ),
        )
        val multiNuc = MutationTables.insertions(
            multi,
            SequenceType.NUCLEOTIDE,
            listOf(InsertionRow(1, 5, "AA", 1)),
            nucRequest,
        )
        assertThat(multiNuc.rows.single()[0], equalTo("ins_M:5:AA"))
        val aa = MutationTables.insertions(
            single,
            SequenceType.AMINO_ACID,
            listOf(InsertionRow(2, 214, "EPE", 1962)),
            QueryRequest(Endpoint.AMINO_ACID_INSERTIONS, fields = listOf("count", "insertion")),
        )
        assertThat(json(aa), equalTo("""[{"insertion":"ins_S:214:EPE","count":1962}]"""))
    }

    @Test
    fun `orderBy insertion expands to sequenceName, position, insertedSymbols`() {
        val rows = listOf(
            InsertionRow(2, 10, "A", 1),
            InsertionRow(1, 10, "C", 1),
            InsertionRow(1, 10, "B", 1),
            InsertionRow(1, 2, "Z", 1),
        )
        val table = MutationTables.insertions(
            single,
            SequenceType.AMINO_ACID,
            rows,
            QueryRequest(Endpoint.AMINO_ACID_INSERTIONS, orderBy = listOf(OrderByField("insertion", DESCENDING))),
        )
        assertThat(table.rows.map { it[0] }, contains("ins_S:10:A", "ins_E:10:C", "ins_E:10:B", "ins_E:2:Z"))
    }
}
