package org.loculus.backend.service.notification

import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.loculus.backend.service.submission.SequenceEntriesTable
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class ReleaseNotificationDatabaseServiceTest(
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val databaseService: ReleaseNotificationDatabaseService,
) {
    @Test
    fun `queue snapshot can be deleted without deleting work enqueued afterward`() {
        val released = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
            .map { AccessionVersion(it.accession, it.version) }
        require(released.size >= 2)
        val groupId = groupIdOf(released.first())
        val firstRelease = released.take(1)
        val concurrentRelease = released.drop(1)

        databaseService.enqueueReleaseNotifications(firstRelease)
        val snapshot = databaseService.getPendingReleaseNotifications()

        assertEquals(firstRelease, snapshot.map(PendingReleaseNotification::accessionVersion))
        assertEquals(setOf(DEFAULT_USER_NAME), snapshot.map(PendingReleaseNotification::approver).toSet())
        assertEquals(setOf(groupId), snapshot.map(PendingReleaseNotification::groupId).toSet())
        assertEquals(setOf(DEFAULT_ORGANISM), snapshot.map(PendingReleaseNotification::organism).toSet())
        assertEquals(setOf(DEFAULT_GROUP.groupName), snapshot.map(PendingReleaseNotification::groupName).toSet())
        assertEquals(
            setOf(DEFAULT_GROUP.contactEmail),
            snapshot.map(PendingReleaseNotification::groupContactEmail).toSet(),
        )

        databaseService.enqueueReleaseNotifications(concurrentRelease)
        databaseService.deletePendingReleaseNotifications(snapshot)

        val remaining = databaseService.getPendingReleaseNotifications()
        assertEquals(concurrentRelease.toSet(), remaining.map(PendingReleaseNotification::accessionVersion).toSet())
    }

    @Test
    fun `an empty queue returns no pending notifications`() {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()

        assertTrue(databaseService.getPendingReleaseNotifications().isEmpty())
    }

    @Test
    fun `a scheduler snapshot is bounded by approver and group partitions`() {
        val releasedForGroupA = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
            .map { AccessionVersion(it.accession, it.version) }
        val releasedForGroupB = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()
            .map { AccessionVersion(it.accession, it.version) }
        val groupA = groupIdOf(releasedForGroupA.first())
        val groupB = groupIdOf(releasedForGroupB.first())
        require(groupA != groupB) { "Expected the two releases to belong to distinct groups" }
        databaseService.enqueueReleaseNotifications(releasedForGroupA)
        databaseService.enqueueReleaseNotifications(releasedForGroupB)

        val firstSnapshot = databaseService.getPendingReleaseNotifications(maxPartitions = 1)
        val firstGroups = firstSnapshot.map(PendingReleaseNotification::groupId).toSet()
        assertEquals(1, firstGroups.size, "A single partition covers exactly one approver/group")

        databaseService.deletePendingReleaseNotifications(firstSnapshot)
        val secondGroups = databaseService.getPendingReleaseNotifications(maxPartitions = 1)
            .map(PendingReleaseNotification::groupId)
            .toSet()
        assertEquals(1, secondGroups.size, "A single partition covers exactly one approver/group")
        assertEquals(setOf(groupA, groupB), firstGroups + secondGroups)
    }

    private fun groupIdOf(accessionVersion: AccessionVersionInterface): Int = transaction {
        SequenceEntriesTable
            .select(SequenceEntriesTable.groupIdColumn)
            .where { SequenceEntriesTable.accessionVersionIsIn(listOf(accessionVersion)) }
            .single()[SequenceEntriesTable.groupIdColumn]
    }
}
