package org.loculus.backend.query.projection

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.not
import org.jetbrains.exposed.v1.jdbc.transactions.TransactionManager
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsChangeRequest
import org.loculus.backend.api.Insertion
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_GROUP_CHANGED
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.datauseterms.DataUseTermsControllerClient
import org.loculus.backend.controller.dateMonthsFromNow
import org.loculus.backend.controller.expectNdjsonAndGetContent
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.submission.SubmissionControllerClient
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.query.QuerySchemaRegistry
import org.loculus.backend.query.schema.QuerySchema
import org.loculus.backend.query.store.SequenceKind
import org.loculus.backend.service.KeycloakAdapter
import org.loculus.backend.service.submission.CompressionDictService
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.sql.Connection
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

@EndpointTest(
    properties = [
        "loculus.query-engine.enabled=true",
        "loculus.query-engine.config-dir=src/test/resources/query-engine",
        "loculus.query-engine.projector-initial-delay-ms=3600000",
        "loculus.query-engine.projector-interval-ms=3600000",
        "loculus.query-engine.projector-batch-size=3",
        "loculus.query-engine.reconcile-accessions-per-second=0",
    ],
)
class QueryProjectorTest(
    @Autowired private val projector: QueryProjector,
    @Autowired private val registry: QuerySchemaRegistry,
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val submissionControllerClient: SubmissionControllerClient,
    @Autowired private val groupClient: GroupManagementControllerClient,
    @Autowired private val dataUseTermsClient: DataUseTermsControllerClient,
    @Autowired private val compressionDictService: CompressionDictService,
    @Autowired private val objectMapper: ObjectMapper,
) {
    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    private val decompressor by lazy { SequenceDecompressor { compressionDictService.getDictById(it) } }

    @BeforeEach
    fun setup() {
        every { keycloakAdapter.getUsersWithName(any()) } returns listOf(UserRepresentation())
        sql {
            it.createStatement().use { s ->
                s.execute(
                    "truncate query_entries, query_mutation_data, query_sequences, query_changelog, " +
                        "query_dirty_accessions, query_engine_state",
                )
            }
        }
    }

    @Test
    fun `projection equals get-released-data after full rebuild and after incremental changes`() {
        val groupId = groupClient.createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
            .andGetGroupId()
        val released = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(groupId = groupId)
        val releasedOther = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(
            organism = OTHER_ORGANISM,
            dataUseTerms = DataUseTerms.Restricted(dateMonthsFromNow(3)),
        )

        runProjector()
        assertProjectionMatchesReleasedData(DEFAULT_ORGANISM)
        assertProjectionMatchesReleasedData(OTHER_ORGANISM)
        assertThat(dirtyAccessions(), empty())
        val changelogAfterRebuild = changelogSize()
        assertThat(changelogAfterRebuild, greaterThan(0))

        // nothing changed -> an extra run does not write anything
        runProjector()
        assertThat(changelogSize(), equalTo(changelogAfterRebuild))

        // revisions (versionStatus of the old versions changes), revocations, group rename, data use terms
        convenienceClient.reviseAndProcessDefaultSequenceEntries(released.map { it.accession })
        val revocations = convenienceClient.revokeSequenceEntries(listOf(released[4].accession))
        convenienceClient.approveProcessedSequenceEntries(revocations)
        groupClient.updateGroup(groupId = groupId, group = DEFAULT_GROUP_CHANGED, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
        dataUseTermsClient.changeDataUseTerms(
            DataUseTermsChangeRequest(listOf(releasedOther[0].accession), DataUseTerms.Open),
        ).andExpect(status().is2xxSuccessful)
        assertThat(dirtyAccessions().size, greaterThan(0))

        runProjector()
        assertThat(dirtyAccessions(), empty())
        assertProjectionMatchesReleasedData(DEFAULT_ORGANISM)
        assertProjectionMatchesReleasedData(OTHER_ORGANISM)
        assertThat(changelogSize(), greaterThan(changelogAfterRebuild))

        val statuses = projectedMetadata(DEFAULT_ORGANISM).values.map { it["versionStatus"].asText() }
        assertThat(statuses, hasItem("REVISED"))
        assertThat(statuses, hasItem("REVOKED"))
    }

    @Test
    fun `ids are stable, removed entries are deleted and a full rebuild reuses ids`() {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        runProjector()
        val idsBefore = projectedIds(DEFAULT_ORGANISM)
        assertThat(idsBefore.size, equalTo(released(DEFAULT_ORGANISM).size))

        val removed = idsBefore.keys.first()
        sql { c ->
            // simulate an entry that is no longer released (e.g. deleted by an administrator)
            c.prepareStatement("delete from sequence_entries_preprocessed_data where accession || '.' || version = ?")
                .use {
                    it.setString(1, removed)
                    it.executeUpdate()
                }
            c.prepareStatement("delete from sequence_entries where accession || '.' || version = ?")
                .use {
                    it.setString(1, removed)
                    it.executeUpdate()
                }
        }
        assertThat(dirtyAccessions(), hasItem(removed.substringBefore('.')))
        runProjector()
        val idsAfter = projectedIds(DEFAULT_ORGANISM)
        assertThat(idsAfter, equalTo(idsBefore - removed))
        assertProjectionMatchesReleasedData(DEFAULT_ORGANISM)

        sql { c ->
            c.createStatement().use { it.executeUpdate("update query_engine_state set needs_full_rebuild = true") }
        }
        val changelogBefore = changelogSize()
        runProjector()
        assertThat(projectedIds(DEFAULT_ORGANISM), equalTo(idsAfter))
        assertThat(changelogSize(), equalTo(changelogBefore))
        assertProjectionMatchesReleasedData(DEFAULT_ORGANISM)
    }

    @Test
    fun `unchanged entries do not rewrite their sequence data and only changed sequence data is recomputed`() {
        val groupId = groupClient.createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
            .andGetGroupId()
        val released = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(groupId = groupId)
        runProjector()
        val changelogBefore = changelogSize()
        val rowVersionsBefore = sequenceRowVersions()

        // a group update that does not change the name does not mark anything dirty
        sql { c ->
            c.createStatement().use { it.executeUpdate("update groups_table set institution = 'other institution'") }
        }
        assertThat(dirtyAccessions(), empty())

        // accessions marked dirty without any change: nothing is rewritten
        sql { c ->
            c.createStatement().use {
                it.executeUpdate("insert into query_dirty_accessions select organism, accession from query_entries")
            }
        }
        runProjector()
        assertThat(dirtyAccessions(), empty())
        assertThat(changelogSize(), equalTo(changelogBefore))
        assertThat(sequenceRowVersions(), equalTo(rowVersionsBefore))

        // changed insertions of one entry: only that entry is recomputed
        val accession = released.first().accession
        sql { c ->
            c.prepareStatement(
                """
                update sequence_entries_preprocessed_data
                set processed_data = jsonb_set(processed_data, '{nucleotideInsertions,main}', '["5:AAA"]')
                where accession = ?
                """.trimIndent(),
            ).use {
                it.setString(1, accession)
                it.executeUpdate()
            }
        }
        assertThat(dirtyAccessions(), equalTo(listOf(accession)))
        runProjector()
        assertThat(changelogSize(), equalTo(changelogBefore + 1))
        assertProjectionMatchesReleasedData(DEFAULT_ORGANISM)
        val changedId = projectedIds(DEFAULT_ORGANISM).getValue("$accession.1")
        val rowVersionsAfter = sequenceRowVersions()
        assertThat(
            rowVersionsAfter.filterKeys { it.first != changedId },
            equalTo(
                rowVersionsBefore.filterKeys {
                    it.first !=
                        changedId
                },
            ),
        )
        assertThat(
            rowVersionsAfter.filterKeys { it == changedId to "mutation_data" },
            not(equalTo(rowVersionsBefore.filterKeys { it == changedId to "mutation_data" })),
        )

        // a group rename marks the group's accessions dirty
        groupClient.updateGroup(groupId = groupId, group = DEFAULT_GROUP_CHANGED, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
        assertThat(dirtyAccessions().size, equalTo(released.size))
        runProjector()
        assertProjectionMatchesReleasedData(DEFAULT_ORGANISM)
        assertThat(sequenceRowVersions(), equalTo(rowVersionsAfter))
    }

    /** (id, table/slot) -> xmin of the sequence-derived rows of dummyOrganism */
    private fun sequenceRowVersions(): Map<Pair<Int, String>, String> = sql { c ->
        c.createStatement().use {
            it.executeQuery(
                """
                select id, 'mutation_data', xmin::text from query_mutation_data where organism = '$DEFAULT_ORGANISM'
                union all
                select id, kind || ':' || sequence_index, xmin::text from query_sequences
                where organism = '$DEFAULT_ORGANISM'
                """.trimIndent(),
            ).use { rs ->
                val result = mutableMapOf<Pair<Int, String>, String>()
                while (rs.next()) result[rs.getInt(1) to rs.getString(2)] = rs.getString(3)
                result
            }
        }
    }

    @Test
    fun `lapsed restricted data use terms are recomputed`() {
        val released = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(
            dataUseTerms = DataUseTerms.Restricted(dateMonthsFromNow(6)),
        )
        runProjector()
        val accession = released.first().accession
        assertThat(
            projectedMetadata(DEFAULT_ORGANISM)["$accession.1"]!!["dataUseTerms"].asText(),
            equalTo("RESTRICTED"),
        )

        // let the restriction end without any trigger firing (like the passing of time does)
        sql { c ->
            c.createStatement().use { it.execute("set session_replication_role = replica") }
            c.prepareStatement(
                "update data_use_terms_table set restricted_until = now() - interval '2 days' where accession = ?",
            ).use {
                it.setString(1, accession)
                it.executeUpdate()
            }
            c.createStatement().use { it.execute("set session_replication_role = origin") }
        }
        assertThat(dirtyAccessions(), empty())
        runProjector()
        assertThat(
            projectedMetadata(DEFAULT_ORGANISM)["$accession.1"]!!["dataUseTerms"].asText(),
            equalTo("RESTRICTED"),
        )

        projector.resetDataUseTermsCheck()
        runProjector()
        assertThat(projectedMetadata(DEFAULT_ORGANISM)["$accession.1"]!!["dataUseTerms"].asText(), equalTo("OPEN"))
        assertProjectionMatchesReleasedData(DEFAULT_ORGANISM)
    }

    @Test
    fun `the reconcile pass recomputes projections that went stale without a trigger`() {
        val released = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        runProjector()
        val accession = released.first().accession
        // a projection that is wrong and not in the dirty queue (like an accession dropped after a failed batch)
        sql { c ->
            c.prepareStatement(
                "update query_entries set metadata = jsonb_set(metadata, '{versionStatus}', '\"STALE\"') " +
                    "where accession = ?",
            ).use {
                it.setString(1, accession)
                it.executeUpdate()
            }
        }
        runProjector()
        assertThat(projectedMetadata(DEFAULT_ORGANISM)["$accession.1"]!!["versionStatus"].asText(), equalTo("STALE"))

        // one pass in steps of 4 accessions marks every released accession once
        val marked = mutableListOf<String>()
        repeat((released.size + 3) / 4) {
            projector.reconcileStep(DEFAULT_ORGANISM, 4)
            marked += dirtyAccessions()
            runProjector()
        }
        assertThat(marked.sorted(), equalTo(released.map { it.accession }.sorted()))
        // this step finds no accession after the cursor and ends the pass
        projector.reconcileStep(DEFAULT_ORGANISM, 4)
        assertThat(dirtyAccessions(), empty())
        // the next one would start a new pass, but the pass interval has not passed yet
        projector.reconcileStep(DEFAULT_ORGANISM, 4)
        assertThat(dirtyAccessions(), empty())
        projector.resetReconcilePassInterval(DEFAULT_ORGANISM)
        projector.reconcileStep(DEFAULT_ORGANISM, 4)
        assertThat(dirtyAccessions().sorted(), equalTo(released.map { it.accession }.sorted().take(4)))
        runProjector()

        assertProjectionMatchesReleasedData(DEFAULT_ORGANISM)
    }

    @Test
    fun `changelog seqs of an organism become visible in commit order without holes`() {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        runProjector()
        val writer = ProjectionWriter(registry.get(DEFAULT_ORGANISM)!!)
        val ids = projectedIds(DEFAULT_ORGANISM).values.sorted()
        val seqsBefore = changelogSeqs()

        // the ordering argument needs a fresh snapshot per statement
        assertThat(
            sql { c ->
                c.createStatement().use { s ->
                    s.executeQuery("show transaction_isolation").use { rs ->
                        rs.next()
                        rs.getString(1)
                    }
                }
            },
            equalTo("read committed"),
        )

        // a rolled-back writer must not leave a hole
        transaction {
            writer.write(TransactionManager.current().connection.connection as Connection, emptyList(), listOf(ids[0]))
            rollback()
        }

        // second writer commits only after a third one has started writing
        val secondWrote = CountDownLatch(1)
        val releaseSecond = CountDownLatch(1)
        val second = thread {
            transaction {
                writer.write(
                    TransactionManager.current().connection.connection as Connection,
                    emptyList(),
                    listOf(ids[1]),
                )
                secondWrote.countDown()
                releaseSecond.await()
            }
        }
        // release writer 2 on every path: a failed assertion must not leave its row lock blocking later tests
        var third: Thread? = null
        try {
            assertThat(secondWrote.await(30, TimeUnit.SECONDS), equalTo(true))
            third = thread {
                transaction {
                    writer.write(
                        TransactionManager.current().connection.connection as Connection,
                        emptyList(),
                        listOf(ids[2]),
                    )
                }
            }
            third.join(500)
            assertThat("third writer waits for the second one", third.isAlive, equalTo(true))
            assertThat(changelogSeqs(), equalTo(seqsBefore))
        } finally {
            releaseSecond.countDown()
            second.join(30_000)
            third?.join(30_000)
        }

        val max = seqsBefore.maxOrNull() ?: 0L
        assertThat(changelogSeqs(), equalTo(seqsBefore + listOf(max + 1, max + 2)))
        assertThat(changelogIdsAbove(max), equalTo(listOf(ids[1], ids[2])))
    }

    // ----------------------------------------------------------------------------------------------------------

    private fun runProjector() {
        assertThat(projector.runOnce(), equalTo(true))
    }

    private fun released(organism: String): List<JsonNode> =
        submissionControllerClient.getReleasedData(organism).expectNdjsonAndGetContent<JsonNode>()

    private fun assertProjectionMatchesReleasedData(organism: String) {
        val schema = registry.get(organism)!!
        val normalizer = LapisMetadataNormalizer(schema.metadata)
        val releasedData = released(organism)
        val metadata = projectedMetadata(organism)
        val ids = projectedIds(organism)
        assertThat(metadata.keys, equalTo(releasedData.map { it["metadata"]["accessionVersion"].asText() }.toSet()))

        for (record in releasedData) {
            val accessionVersion = record["metadata"]["accessionVersion"].asText()
            val md = record["metadata"].properties().associate { it.key to it.value }
            val expected = objectMapper.readTree(objectMapper.writeValueAsString(normalizer.normalize(md)))
            assertThat(accessionVersion, metadata[accessionVersion], equalTo(expected))
            assertSequenceData(schema, ids.getValue(accessionVersion), record)
        }
    }

    private fun assertSequenceData(schema: QuerySchema, id: Int, record: JsonNode) {
        val expectedMutations = IntList()
        val expectedMissing = IntList()
        val expectedPresent = mutableListOf<Int>()
        val expectedInsertions = mutableListOf<String>()
        val expectedSequences = mutableMapOf<Pair<Short, Int>, String>()
        for (segment in schema.nucleotideSequences) {
            record["unalignedNucleotideSequences"][segment.name]?.takeIf { !it.isNull }?.let {
                expectedSequences[SequenceKind.UNALIGNED_NUCLEOTIDE.code to segment.index] = it.asText()
            }
            record["alignedNucleotideSequences"][segment.name]?.takeIf { !it.isNull }?.let {
                expectedSequences[SequenceKind.ALIGNED_NUCLEOTIDE.code to segment.index] = it.asText()
                expectedPresent.add(segment.index)
                val bytes = it.asText().toByteArray()
                SequenceAnalysis.analyzeAligned(segment, bytes, bytes.size, expectedMutations, expectedMissing)
            }
            record["nucleotideInsertions"][segment.name]?.forEach {
                expectedInsertions.add(
                    SequenceAnalysis.formatInsertion(segment.index, Insertion.fromString(it.asText())),
                )
            }
        }
        for (gene in schema.genes) {
            record["alignedAminoAcidSequences"][gene.name]?.takeIf { !it.isNull }?.let {
                expectedSequences[SequenceKind.ALIGNED_AMINO_ACID.code to gene.index] = it.asText()
                expectedPresent.add(gene.index)
                val bytes = it.asText().toByteArray()
                SequenceAnalysis.analyzeAligned(gene, bytes, bytes.size, expectedMutations, expectedMissing)
            }
            record["aminoAcidInsertions"][gene.name]?.forEach {
                expectedInsertions.add(SequenceAnalysis.formatInsertion(gene.index, Insertion.fromString(it.asText())))
            }
        }

        val (present, mutations, missing, insertions) = sql { c ->
            c.prepareStatement(
                "select present_sequences, mutations, missing, insertions from query_mutation_data " +
                    "where organism = ? and id = ?",
            ).use {
                it.setString(1, schema.organism)
                it.setInt(2, id)
                it.executeQuery().use { rs ->
                    check(rs.next()) { "no mutation data for $id" }
                    listOf(1, 2, 3, 4).map { col -> (rs.getArray(col).array as Array<*>).toList() }
                }
            }
        }
        assertThat(present, equalTo(expectedPresent))
        assertThat(mutations, equalTo(expectedMutations.toIntArray().toList()))
        assertThat(missing, equalTo(expectedMissing.toIntArray().toList()))
        assertThat(insertions, equalTo(expectedInsertions))
        if (record["metadata"]["isRevocation"].asBoolean()) assertThat(expectedSequences.size, equalTo(0))

        val sequences = sql { c ->
            c.prepareStatement(
                "select kind, sequence_index, compression_dict_id, data from query_sequences where organism = ? and id = ?",
            ).use {
                it.setString(1, schema.organism)
                it.setInt(2, id)
                it.executeQuery().use { rs ->
                    val result = mutableMapOf<Pair<Short, Int>, String>()
                    while (rs.next()) {
                        val dictId = rs.getInt(3).takeIf { _ -> !rs.wasNull() }
                        result[rs.getShort(1) to rs.getInt(2)] =
                            decompressor.decompress(rs.getBytes(4), dictId) { b, n -> String(b, 0, n) }
                    }
                    result
                }
            }
        }
        assertThat(sequences, equalTo(expectedSequences))
    }

    private fun projectedMetadata(organism: String): Map<String, JsonNode> = sql { c ->
        c.prepareStatement("select accession_version, metadata from query_entries where organism = ?").use {
            it.setString(1, organism)
            it.executeQuery().use { rs ->
                val result = mutableMapOf<String, JsonNode>()
                while (rs.next()) result[rs.getString(1)] = objectMapper.readTree(rs.getString(2))
                result
            }
        }
    }

    private fun projectedIds(organism: String): Map<String, Int> = sql { c ->
        c.prepareStatement("select accession_version, id from query_entries where organism = ?").use {
            it.setString(1, organism)
            it.executeQuery().use { rs ->
                val result = mutableMapOf<String, Int>()
                while (rs.next()) result[rs.getString(1)] = rs.getInt(2)
                result
            }
        }
    }

    private fun dirtyAccessions(): List<String> = sql { c ->
        c.createStatement().use {
            it.executeQuery("select accession from query_dirty_accessions").use { rs ->
                val result = mutableListOf<String>()
                while (rs.next()) result.add(rs.getString(1))
                result
            }
        }
    }

    private fun changelogSeqs(): List<Long> = sql { c ->
        c.prepareStatement("select seq from query_changelog where organism = ? order by seq").use {
            it.setString(1, DEFAULT_ORGANISM)
            it.executeQuery().use { rs ->
                val result = mutableListOf<Long>()
                while (rs.next()) result.add(rs.getLong(1))
                result
            }
        }
    }

    private fun changelogIdsAbove(seq: Long): List<Int> = sql { c ->
        c.prepareStatement("select id from query_changelog where organism = ? and seq > ? order by seq").use {
            it.setString(1, DEFAULT_ORGANISM)
            it.setLong(2, seq)
            it.executeQuery().use { rs ->
                val result = mutableListOf<Int>()
                while (rs.next()) result.add(rs.getInt(1))
                result
            }
        }
    }

    private fun changelogSize(): Int = sql { c ->
        c.createStatement().use {
            it.executeQuery("select count(*) from query_changelog").use { rs ->
                rs.next()
                rs.getInt(1)
            }
        }
    }

    private fun <T> sql(block: (Connection) -> T): T = transaction {
        block(TransactionManager.current().connection.connection as Connection)
    }
}
