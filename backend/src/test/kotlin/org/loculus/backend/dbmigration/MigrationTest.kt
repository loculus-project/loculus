package org.loculus.backend.dbmigration

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class CompressionDictMigrationTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {

    @Test
    fun `test compression dictionary migration`() {
        val releasedData = convenienceClient.getReleasedData()

        println(releasedData)

        assertThat(releasedData, hasSize(30))
    }
}
