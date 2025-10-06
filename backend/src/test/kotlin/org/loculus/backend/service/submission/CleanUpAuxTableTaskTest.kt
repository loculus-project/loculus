package org.loculus.backend.service.maintenance

import io.mockk.every
import io.mockk.mockk
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.minus
import kotlinx.datetime.toLocalDateTime
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Organism
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.service.submission.MetadataUploadAuxTable
import org.loculus.backend.service.submission.UploadDatabaseService
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.MetadataEntry
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest(
    properties = [
        "${BackendSpringProperty.CLEAN_UP_RUN_EVERY_SECONDS}=3600",
    ],
)
class CleanUpAuxTableTaskTest(
    @Autowired val uploadDatabaseService: UploadDatabaseService,
    @Autowired val dateProvider: DateProvider,
    @Autowired val cleanUpAuxTableTask: CleanUpAuxTableTask,
) {

    @Test
    fun `GIVEN aux table has old and recent entries WHEN running clean up THEN remove only old entries`() {
        val uploadId = "upload id"
        val mockUser = mockk<AuthenticatedUser>()
        every { mockUser.username }.returns("username")
        val now = dateProvider.getCurrentInstant()
        val oneHourOld = now.minus(
            1,
            DateTimeUnit.HOUR,
            DateProvider.timeZone,
        ).toLocalDateTime(DateProvider.timeZone)
        uploadDatabaseService.batchInsertMetadataInAuxTable(
            uploadId = uploadId,
            authenticatedUser = mockUser,
            groupId = 1,
            submittedOrganism = Organism("organism"),
            uploadedMetadataBatch = listOf(MetadataEntry("submission id", mapOf("key" to "value"))),
            uploadedAt = oneHourOld,
            null,
        )
        val uploadIdOld = "upload id old"
        val oneDayOld = now.minus(
            25,
            DateTimeUnit.HOUR,
            DateProvider.timeZone,
        ).toLocalDateTime(DateProvider.timeZone)
        uploadDatabaseService.batchInsertMetadataInAuxTable(
            uploadId = uploadIdOld,
            authenticatedUser = mockUser,
            groupId = 1,
            submittedOrganism = Organism("organism"),
            uploadedMetadataBatch = listOf(MetadataEntry("submission id", mapOf("key" to "value"))),
            uploadedAt = oneDayOld,
            null,
        )

        transaction {
            val count = MetadataUploadAuxTable.selectAll().count()
            assertThat(count, `is`(2L))
        }
        cleanUpAuxTableTask.task()

        transaction {
            val count = MetadataUploadAuxTable.selectAll().count()
            assertThat(count, `is`(1L))
        }
    }
}
