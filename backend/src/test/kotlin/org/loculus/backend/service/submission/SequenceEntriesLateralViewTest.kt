package org.loculus.backend.service.submission

import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThan
import org.jetbrains.exposed.v1.jdbc.transactions.TransactionManager
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.jupiter.api.Test
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.api.Organism
import org.loculus.backend.api.Status
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.model.ReleasedDataModel
import org.loculus.backend.service.KeycloakAdapter
import org.springframework.beans.factory.annotation.Autowired
import java.sql.Connection

@EndpointTest
class SequenceEntriesLateralViewTest(
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val releasedDataModel: ReleasedDataModel,
) {
    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    @Test
    fun `sequence_entries_lateral_view returns the same rows as sequence_entries_view`() {
        every { keycloakAdapter.getUsersWithName(any()) } returns listOf(UserRepresentation())
        val released = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
        convenienceClient.reviseAndProcessDefaultSequenceEntries(released.map { it.accession })
        convenienceClient.approveProcessedSequenceEntries(
            convenienceClient.revokeSequenceEntries(listOf(released[4].accession)),
        )
        convenienceClient.prepareDataTo(Status.RECEIVED)
        convenienceClient.prepareDataTo(Status.PROCESSED, errors = true)

        sql { c ->
            c.createStatement().use {
                it.execute(
                    """
                    insert into external_metadata
                        (accession, version, external_metadata_updater, external_metadata, updated_metadata_at)
                    values
                        -- one updater
                        ('${released[0].accession}', 1, 'ena', '{"insdcAccessionFull": "A1.1"}', now()),
                        -- two updaters of one version (disjoint keys: the merge order is unspecified in both views)
                        ('${released[1].accession}', 1, 'ena', '{"insdcAccessionFull": "B1.1"}', now()),
                        ('${released[1].accession}', 1, 'other', '{"bioprojectAccession": "PRJ1"}', now()),
                        -- only the older of two versions has external metadata
                        ('${released[2].accession}', 1, 'ena', '{"insdcAccessionFull": "C1.1"}', now()),
                        -- the revoked accession
                        ('${released[4].accession}', 1, 'ena', '{"insdcAccessionFull": "E1.1"}', now()),
                        -- a null value
                        ('${released[5].accession}', 1, 'ena', null, now())
                    """.trimIndent(),
                )
            }
        }

        val view = viewRows(SEQUENCE_ENTRIES_VIEW_NAME)
        assertThat(view.size, greaterThan(released.size))
        assertThat(viewRows(SEQUENCE_ENTRIES_LATERAL_VIEW_NAME), equalTo(view))

        // the query engine's accession-filtered read (lateral view) returns what the full stream returns
        val organism = Organism(DEFAULT_ORGANISM)
        val accessions = released.map { it.accession }.take(6)
        transaction {
            val full = releasedDataModel.streamReleasedDataWithCompressedSequences(organism)
                .filter { it.accession in accessions }
                .map { Triple(it.accession, it.version, it.metadata) }
                .toList()
            val filtered = releasedDataModel.streamReleasedDataWithCompressedSequences(organism, accessions)
                .map { Triple(it.accession, it.version, it.metadata) }
                .toList()
            assertThat(filtered.size, greaterThan(accessions.size))
            assertThat(filtered, equalTo(full))
        }
    }

    private fun viewRows(view: String): List<String> = sql { c ->
        c.createStatement().use {
            it.executeQuery("select to_jsonb(v)::text from $view v order by accession, version").use { rs ->
                val result = mutableListOf<String>()
                while (rs.next()) result.add(rs.getString(1))
                result
            }
        }
    }

    private fun <T> sql(block: (Connection) -> T): T = transaction {
        block(TransactionManager.current().connection.connection as Connection)
    }
}
