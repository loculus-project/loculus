package org.loculus.backend.service.submission

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import org.loculus.backend.api.Organism
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DUMMY_ORGANISM_MAIN_SEQUENCE
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.OTHER_ORGANISM
import org.springframework.beans.factory.annotation.Autowired

@EndpointTest
class CompressionDictServiceTest(@Autowired private val underTest: CompressionDictService) {
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

        assertThat(forUnalignedSequence.dict, `is`(("ATCG" + "AAAAAAAAAAAAAAAA").toByteArray()))

        val byId = underTest.getDictById(forUnalignedSequence.id)

        assertThat(byId, `is`(forUnalignedSequence.dict))
    }
}
