package org.loculus.backend.service.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Organism
import org.loculus.backend.config.Metadata
import org.loculus.backend.config.MetadataType
import org.loculus.backend.config.OrganismConfig
import org.loculus.backend.config.ReferenceGenome
import org.loculus.backend.config.ReferenceSequence
import org.loculus.backend.config.Schema
import org.loculus.backend.config.service.DraftService
import org.loculus.backend.config.service.OrganismAdminService
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DUMMY_ORGANISM_MAIN_SEQUENCE
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class CompressionDictServiceTest(
    @Autowired private val underTest: CompressionDictService,
    @Autowired private val organismAdminService: OrganismAdminService,
    @Autowired private val draftService: DraftService,
) {
    @Test
    fun `gets dict by segment name and id`() {
        val bySegment = underTest.getDictForSegmentOrGene(Organism(DEFAULT_ORGANISM), "main")!!

        assertThat(bySegment.dict, `is`(DUMMY_ORGANISM_MAIN_SEQUENCE.toByteArray()))

        val byId = underTest.getDictById(bySegment.id)

        assertThat(byId, `is`(bySegment.dict))
    }

    @Test
    fun `gets dict for unprocessed unaligned sequences`() {
        val forUnalignedSequence = underTest.getDictForUnalignedSequence(Organism(OTHER_ORGANISM))!!

        assertThat(forUnalignedSequence.dict, `is`(("AAAAAAAAAAAAAAAA" + "ATCG").toByteArray()))

        val byId = underTest.getDictById(forUnalignedSequence.id)

        assertThat(byId, `is`(forUnalignedSequence.dict))
    }

    @Test
    fun `gets dict for organism published after cache population`() {
        underTest.getDictForSegmentOrGene(Organism(DEFAULT_ORGANISM), "main")

        organismAdminService.createOrganism("runtimeOrganism", "test")
        draftService.putOrganismDraft("runtimeOrganism", runtimeOrganismConfig, null, "test")
        draftService.publishOrganism("runtimeOrganism", "test")

        val organism = Organism("runtimeOrganism")
        val bySegment = underTest.getDictForSegmentOrGene(organism, "main")!!
        val unaligned = underTest.getDictForUnalignedSequence(organism)!!

        assertThat(bySegment.dict, `is`("GATTACA".toByteArray()))
        assertThat(unaligned.dict, `is`("GATTACA".toByteArray()))
    }

    private val runtimeOrganismConfig = OrganismConfig(
        schema = Schema(
            organismName = "Runtime organism",
            metadata = listOf(Metadata(name = "date", type = MetadataType.DATE, required = true)),
        ),
        referenceGenome = ReferenceGenome(
            nucleotideSequences = listOf(ReferenceSequence("main", "GATTACA")),
            genes = emptyList(),
        ),
    )
}
