package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.NullNode
import com.fasterxml.jackson.databind.node.TextNode
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.anEmptyMap
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.loculus.backend.api.AccessionVersion
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.Insertion
import org.loculus.backend.api.OriginalData
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.Status.APPROVED_FOR_RELEASE
import org.loculus.backend.api.Status.IN_PROCESSING
import org.loculus.backend.api.Status.PROCESSED
import org.loculus.backend.api.Status.RECEIVED
import org.loculus.backend.api.SubmissionIdMapping
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.ORGANISM_WITHOUT_CONSENSUS_SEQUENCES
import org.loculus.backend.controller.OTHER_ORGANISM
import org.loculus.backend.controller.SegmentedMultiPathogenOrganism
import org.loculus.backend.controller.assertHasError
import org.loculus.backend.controller.assertStatusIs
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.loculus.backend.utils.Accession
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class SubmissionJourneyTest(@Autowired val convenienceClient: SubmissionConvenienceClient) {
    @Test
    fun `Submission scenario, from submission, over edit and approval ending in status 'APPROVED_FOR_RELEASE'`() {
        val accessions = convenienceClient.submitDefaultFiles()
            .submissionIdMappings
            .map { it.accession }

        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(RECEIVED)

        convenienceClient.extractUnprocessedData()
        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(IN_PROCESSING)

        convenienceClient.submitProcessedData(
            accessions.map {
                PreparedProcessedData.withErrors(accession = it)
            },
        )
        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(PROCESSED)
            .assertHasError(true)

        convenienceClient.submitDefaultEditedData(accessions)
        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(RECEIVED)

        convenienceClient.extractUnprocessedData()
        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(IN_PROCESSING)

        convenienceClient.submitProcessedData(
            accessions.map {
                PreparedProcessedData.successfullyProcessed(accession = it)
            },
        )
        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(PROCESSED)
            .assertHasError(false)

        convenienceClient.approveProcessedSequenceEntries(
            accessions.map {
                AccessionVersion(it, 1)
            },
        )
        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 1)
            .assertStatusIs(APPROVED_FOR_RELEASE)
    }

    @Test
    fun `Revising, from submitting revised data over processing, approving ending in status 'APPROVED_FOR_RELEASE'`() {
        val accessions = convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease().map { it.accession }

        convenienceClient.reviseDefaultProcessedSequenceEntries(accessions)
        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 2)
            .assertStatusIs(RECEIVED)

        convenienceClient.extractUnprocessedData()
        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 2)
            .assertStatusIs(IN_PROCESSING)

        convenienceClient.submitProcessedData(
            accessions.map {
                PreparedProcessedData.successfullyProcessed(accession = it, version = 2)
            },
        )
        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 2)
            .assertStatusIs(PROCESSED)

        convenienceClient.approveProcessedSequenceEntries(
            accessions.map {
                AccessionVersion(it, 2)
            },
        )
        convenienceClient.getSequenceEntry(accession = accessions.first(), version = 2)
            .assertStatusIs(APPROVED_FOR_RELEASE)
    }

    @Test
    fun `Release journey scenario for two organisms`() {
        val defaultOrganismData = convenienceClient.submitDefaultFiles(organism = DEFAULT_ORGANISM).submissionIdMappings
        val otherOrganismData = convenienceClient.submitDefaultFiles(organism = OTHER_ORGANISM).submissionIdMappings

        convenienceClient.extractUnprocessedData(organism = DEFAULT_ORGANISM)
        convenienceClient.extractUnprocessedData(organism = OTHER_ORGANISM)

        convenienceClient.submitProcessedData(
            defaultOrganismData.map {
                PreparedProcessedData.successfullyProcessed(accession = it.accession, version = it.version)
            },
            organism = DEFAULT_ORGANISM,
        )
        convenienceClient.submitProcessedData(
            otherOrganismData.map {
                PreparedProcessedData.successfullyProcessedOtherOrganismData(
                    accession = it.accession,
                    version = it.version,
                )
            },
            organism = OTHER_ORGANISM,
        )

        convenienceClient.approveProcessedSequenceEntries(
            defaultOrganismData.map {
                AccessionVersion(
                    it.accession,
                    it.version,
                )
            },
            organism = DEFAULT_ORGANISM,
        )
        convenienceClient.approveProcessedSequenceEntries(
            otherOrganismData.map {
                AccessionVersion(
                    it.accession,
                    it.version,
                )
            },
            organism = OTHER_ORGANISM,
        )

        val defaultOrganismReleasedData = convenienceClient.getReleasedData(organism = DEFAULT_ORGANISM)
        val otherOrganismReleasedData = convenienceClient.getReleasedData(organism = OTHER_ORGANISM)

        assertThat(defaultOrganismReleasedData.size, `is`(DefaultFiles.NUMBER_OF_SEQUENCES))
        assertThat(otherOrganismReleasedData.size, `is`(DefaultFiles.NUMBER_OF_SEQUENCES))

        val defaultOrganismAccessionVersions = getAccessionVersionsOfProcessedData(defaultOrganismReleasedData)
        val otherOrganismAccessionVersions = getAccessionVersionsOfProcessedData(otherOrganismReleasedData)

        assertThat(
            defaultOrganismAccessionVersions,
            containsInAnyOrder(*getAccessionVersions(defaultOrganismData).toTypedArray()),
        )
        assertThat(
            otherOrganismAccessionVersions,
            containsInAnyOrder(*getAccessionVersions(otherOrganismData).toTypedArray()),
        )
        assertThat(
            defaultOrganismAccessionVersions.intersect(getAccessionVersions(otherOrganismData).toSet()),
            `is`(empty()),
        )
        assertThat(
            otherOrganismAccessionVersions.intersect(getAccessionVersions(defaultOrganismData).toSet()),
            `is`(empty()),
        )
    }

    @Test
    fun `Entries without consensus sequences - submission, edit, approval`() {
        val accessions = convenienceClient.submitDefaultFiles(organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES)
            .submissionIdMappings
            .map { it.accession }

        val getSequenceEntry = {
            convenienceClient.getSequenceEntry(
                accession = accessions.first(),
                version = 1,
                organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES,
            )
        }

        getSequenceEntry().assertStatusIs(RECEIVED)

        convenienceClient.extractUnprocessedData(organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES)
        convenienceClient.submitProcessedData(
            accessions.map {
                PreparedProcessedData.withErrors(accession = it)
                    .copy(data = defaultProcessedDataWithoutSequences)
            },
            organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES,
        )

        getSequenceEntry().assertStatusIs(PROCESSED)
            .assertHasError(true)

        convenienceClient.submitEditedData(
            accessions,
            organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES,
            editedData = OriginalData(
                metadata = defaultOriginalData.metadata,
                unalignedNucleotideSequences = emptyMap(),
            ),
        )
        getSequenceEntry().assertStatusIs(RECEIVED)

        convenienceClient.extractUnprocessedData(organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES)
        getSequenceEntry().assertStatusIs(IN_PROCESSING)

        convenienceClient.submitProcessedData(
            accessions.map {
                PreparedProcessedData.successfullyProcessed(accession = it)
                    .copy(data = defaultProcessedDataWithoutSequences)
            },
            organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES,
        )
        getSequenceEntry().assertStatusIs(PROCESSED)
            .assertHasError(false)

        convenienceClient.approveProcessedSequenceEntries(
            accessions.map {
                AccessionVersion(it, 1)
            },
            organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES,
        )
        getSequenceEntry().assertStatusIs(APPROVED_FOR_RELEASE)

        val releasedData = convenienceClient.getReleasedData(organism = ORGANISM_WITHOUT_CONSENSUS_SEQUENCES)
        assertThat(releasedData.size, `is`(DefaultFiles.NUMBER_OF_SEQUENCES))
        val releasedDatum = releasedData.first()
        assertThat(releasedDatum.unalignedNucleotideSequences, `is`(anEmptyMap()))
        assertThat(releasedDatum.alignedNucleotideSequences, `is`(anEmptyMap()))
        assertThat(releasedDatum.alignedAminoAcidSequences, `is`(anEmptyMap()))
        assertThat(releasedDatum.nucleotideInsertions, `is`(anEmptyMap()))
        assertThat(releasedDatum.aminoAcidInsertions, `is`(anEmptyMap()))
    }

    @Test
    fun `Multi pathogen submission flow`() {
        val accessionVersions = convenienceClient
            .submitDefaultFiles(organism = SegmentedMultiPathogenOrganism.NAME)
            .submissionIdMappings
        val firstAccessionVersion = accessionVersions[0]

        processAndCheckInitialSubmission(accessionVersions, firstAccessionVersion)
        processAndCheckRevision(firstAccessionVersion)
        processAndCheckRevocation(firstAccessionVersion)
    }

    private fun processAndCheckInitialSubmission(
        accessionVersions: List<SubmissionIdMapping>,
        firstAccessionVersion: SubmissionIdMapping,
    ) {
        convenienceClient.extractUnprocessedData(organism = SegmentedMultiPathogenOrganism.NAME)

        convenienceClient.submitProcessedData(
            accessionVersions.map {
                PreparedProcessedData.successfullyProcessedMultiSegmentMultiPathogenData(
                    accession = it.accession,
                    version = it.version,
                )
            },
            organism = SegmentedMultiPathogenOrganism.NAME,
        )

        convenienceClient.approveProcessedSequenceEntries(
            accessionVersionsFilter = accessionVersions,
            organism = SegmentedMultiPathogenOrganism.NAME,
        )

        val releasedData = convenienceClient.getReleasedData(
            organism = SegmentedMultiPathogenOrganism.NAME,
        )

        assertReleasedDataLooksAsExpected(releasedData, firstAccessionVersion.accession)
    }

    private fun processAndCheckRevision(firstAccessionVersion: SubmissionIdMapping) {
        val revisedAccessionVersion = convenienceClient
            .revise(
                accessions = listOf(firstAccessionVersion.accession),
                sequencesFile = SubmitFiles.sequenceFileWith(
                    content = """
                            >custom0_firstSegment
                            ATTG
                        """.trimIndent(),
                ),
                organism = SegmentedMultiPathogenOrganism.NAME,
            )
            .first()

        convenienceClient.extractUnprocessedData(organism = SegmentedMultiPathogenOrganism.NAME)

        convenienceClient.submitProcessedData(
            listOf(
                PreparedProcessedData.successfullyProcessedMultiSegmentMultiPathogenData(
                    accession = revisedAccessionVersion.accession,
                    version = revisedAccessionVersion.version,
                ),
            ),
            organism = SegmentedMultiPathogenOrganism.NAME,
        )

        convenienceClient.approveProcessedSequenceEntries(
            accessionVersionsFilter = listOf(revisedAccessionVersion),
            organism = SegmentedMultiPathogenOrganism.NAME,
        )

        val revisedReleasedData = convenienceClient.getReleasedData(
            organism = SegmentedMultiPathogenOrganism.NAME,
        )
        assertReleasedDataLooksAsExpected(revisedReleasedData, firstAccessionVersion.accession, revision = true)
    }

    private fun processAndCheckRevocation(firstAccessionVersion: SubmissionIdMapping) {
        val revokedAccessionVersion = convenienceClient.revokeSequenceEntries(
            listOfAccessionsToRevoke = listOf(firstAccessionVersion.accession),
            organism = SegmentedMultiPathogenOrganism.NAME,
        ).first()

        convenienceClient.approveProcessedSequenceEntries(
            accessionVersionsFilter = listOf(revokedAccessionVersion),
            organism = SegmentedMultiPathogenOrganism.NAME,
        )

        val revokedReleasedData = convenienceClient.getReleasedData(
            organism = SegmentedMultiPathogenOrganism.NAME,
        )
        assertReleasedDataLooksAsExpected(revokedReleasedData, firstAccessionVersion.accession, revocation = true)
    }

    private fun assertReleasedDataLooksAsExpected(
        releasedData: List<ProcessedData<GeneticSequence>>,
        accession: Accession,
        revision: Boolean = false,
        revocation: Boolean = false,
    ) {
        val expectedSize = when {
            revocation -> DefaultFiles.NUMBER_OF_SEQUENCES + 2
            revision -> DefaultFiles.NUMBER_OF_SEQUENCES + 1
            else -> DefaultFiles.NUMBER_OF_SEQUENCES
        }
        assertThat(releasedData, hasSize(expectedSize))

        val expectedVersion = when {
            revocation -> 3
            revision -> 2
            else -> 1
        }
        val firstReleasedEntry = releasedData.find {
            it.metadata["accession"] == TextNode(accession) &&
                it.metadata["version"] == IntNode(expectedVersion)
        }!!
        assertThat(
            firstReleasedEntry.metadata["country"],
            `is`(
                when (revocation) {
                    true -> NullNode.instance
                    else -> TextNode("Spain")
                },
            ),
        )
        assertThat(
            firstReleasedEntry.unalignedNucleotideSequences,
            `is`(
                mapOf(
                    "firstSuborganism-firstSegment" to when (revocation) {
                        true -> null
                        else -> "NNACTGNN"
                    },
                    "firstSuborganism-secondSegment" to when (revocation) {
                        true -> null
                        else -> "AAAAAAAAAAAAAAAT"
                    },
                    "secondSuborganism-firstSegment" to null,
                    "secondSuborganism-thirdSegment" to null,
                    "secondSuborganism-differentSecondSegment" to null,
                ),
            ),
        )
        assertThat(
            firstReleasedEntry.alignedNucleotideSequences,
            `is`(
                mapOf(
                    "firstSuborganism-firstSegment" to when (revocation) {
                        true -> null
                        else -> "ATTG"
                    },
                    "firstSuborganism-secondSegment" to when (revocation) {
                        true -> null
                        else -> "AAAAAAAAAAAAAAAT"
                    },
                    "secondSuborganism-firstSegment" to null,
                    "secondSuborganism-thirdSegment" to null,
                    "secondSuborganism-differentSecondSegment" to null,
                ),
            ),
        )
        assertThat(
            firstReleasedEntry.nucleotideInsertions,
            `is`(
                mapOf(
                    "firstSuborganism-firstSegment" to when (revocation) {
                        true -> emptyList()
                        else -> listOf(Insertion(position = 123, sequence = "RNRNRN"))
                    },
                    "firstSuborganism-secondSegment" to emptyList(),
                    "secondSuborganism-firstSegment" to emptyList(),
                    "secondSuborganism-thirdSegment" to emptyList(),
                    "secondSuborganism-differentSecondSegment" to emptyList(),
                ),
            ),
        )
        assertThat(
            firstReleasedEntry.alignedAminoAcidSequences,
            `is`(
                mapOf(
                    "firstSuborganism-someLongGene" to when (revocation) {
                        true -> null
                        else -> "AAAAAAAAAAAAAAAAAAAAAAATT"
                    },
                    "firstSuborganism-someShortGene" to when (revocation) {
                        true -> null
                        else -> "MADS"
                    },
                    "secondSuborganism-someLongGene" to null,
                    "secondSuborganism-anotherShortGene" to null,
                ),
            ),
        )
        assertThat(
            firstReleasedEntry.aminoAcidInsertions,
            `is`(
                mapOf(
                    "firstSuborganism-someLongGene" to when (revocation) {
                        true -> emptyList()
                        else -> listOf(Insertion(position = 123, sequence = "RNRNRN"))
                    },
                    "firstSuborganism-someShortGene" to emptyList(),
                    "secondSuborganism-someLongGene" to emptyList(),
                    "secondSuborganism-anotherShortGene" to emptyList(),
                ),
            ),
        )
    }

    private fun getAccessionVersionsOfProcessedData(processedData: List<ProcessedData<GeneticSequence>>) = processedData
        .map { it.metadata }
        .map { it["accessionVersion"]!!.asText() }

    private fun getAccessionVersions(sequenceEntryVersions: List<AccessionVersionInterface>) =
        sequenceEntryVersions.map { it.displayAccessionVersion() }
}
