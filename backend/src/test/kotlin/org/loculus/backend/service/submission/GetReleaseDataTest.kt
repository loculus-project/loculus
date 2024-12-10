package org.loculus.backend.service.submission

import kotlinx.datetime.Clock
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.`is`
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.service.datauseterms.DataUseTermsTable
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class GetReleaseDataTest(
    @Autowired private val client: GroupManagementControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {

    @Test
    fun `getReleaseData results are sorted`() {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)
        val accessions = listOf("SEQ1", "SEQ2", "SEQ3", "SEQ4")

        transaction {
            // create initial submission group
            val defaultGroupId = client.createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
                .andExpect(status().isOk)
                .andGetGroupId()

            // Set OPEN data use terms for all accessions
            accessions.forEach { accession ->
                DataUseTermsTable.insert {
                    it[accessionColumn] = accession
                    it[changeDateColumn] = now
                    it[dataUseTermsTypeColumn] = DataUseTerms.Open.type.toString()
                    it[userNameColumn] = "foo"
                }
            }

            // insert accessions with 3 versions in random order
            accessions.flatMap { accession ->
                listOf(1L, 2L, 3L).map {
                    accession to it
                }
            }.shuffled().forEach { (accession, version) ->
                SequenceEntriesTable.insert {
                    it[accessionColumn] = accession
                    it[versionColumn] = version
                    it[organismColumn] = DEFAULT_ORGANISM
                    it[submissionIdColumn] = "foo"
                    it[submitterColumn] = "bar"
                    it[groupIdColumn] = defaultGroupId
                    it[submittedAtTimestampColumn] = now
                    it[releasedAtTimestampColumn] = LocalDateTime(2000, 1, 1, 1, 1)
                }
            }
        }

        val data = convenienceClient.getReleasedData(DEFAULT_ORGANISM)

        // assert that the accessions are sorted
        assertThat(data.size, `is`(12))
        val actualAccessionOrder = data.map { it.metadata["accession"]!!.asText() }
        assertThat(actualAccessionOrder, equalTo(actualAccessionOrder.sorted()))

        // assert that _within_ each accession block, it's sorted by version
        val accessionChunks = data.groupBy { it.metadata["accession"]!!.asText() }
        assertThat(accessionChunks.size, `is`(accessions.size))
        accessionChunks.values
            .map { chunk -> chunk.map { it.metadata["version"]!!.asLong() } }
            .forEach { assertThat(it, equalTo(it.sorted())) }
    }
}

// TODO move this file an rename
