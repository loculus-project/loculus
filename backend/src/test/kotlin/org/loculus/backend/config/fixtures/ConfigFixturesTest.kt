package org.loculus.backend.config.fixtures

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.notNullValue
import org.junit.jupiter.api.Test
import org.loculus.backend.config.service.ConfigService
import org.loculus.backend.controller.EndpointTest
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.context.annotation.Import

@EndpointTest
@Import(ConfigFixturesConfig::class)
class ConfigFixturesTest(
    @Autowired private val fixtures: ConfigFixtures,
    @Autowired private val configService: ConfigService,
) {

    @Test
    fun `loads the default variant`() {
        fixtures.loadDefault()

        val instance = configService.getInstanceConfig().config
        assertThat(instance.name, equalTo("Loculus"))
        assertThat(instance.accessionPrefix, equalTo("LOC_"))
        assertThat(instance.dataUseTerms.enabled, equalTo(true))

        val organisms = configService.listOrganismKeys()
        assertThat(
            organisms,
            containsInAnyOrder("dummyOrganism", "otherOrganism", "dummyOrganismWithoutConsensusSequences"),
        )

        val dummy = configService.getOrganismConfig("dummyOrganism").config
        assertThat(dummy, notNullValue())
        assertThat(dummy.displayName, equalTo("Displayed test organism"))
        assertThat(dummy.schema.organismName, equalTo("Test"))
        assertThat(
            dummy.schema.metadata.map { it.name },
            containsInAnyOrder(
                "date", "dateSubmitted", "region", "country", "division", "host", "age", "sex",
                "pangoLineage", "qc", "booleanColumn", "insdcAccessionFull", "other_db_accession",
            ),
        )
    }

    @Test
    fun `loads the single-segment variant`() {
        fixtures.loadVariant("single-segment")

        val organisms = configService.listOrganismKeys()
        assertThat(organisms, containsInAnyOrder("dummyOrganism"))

        val dummy = configService.getOrganismConfig("dummyOrganism").config
        assertThat(dummy.referenceGenome.nucleotideSequences.single().sequence, equalTo("ACGT"))
    }

    @Test
    fun `loads the data-use-terms-disabled variant`() {
        fixtures.loadVariant("data-use-terms-disabled")

        val instance = configService.getInstanceConfig().config
        assertThat(instance.dataUseTerms.enabled, equalTo(false))
    }

    @Test
    fun `loads the s3 variant`() {
        fixtures.loadVariant("s3")

        val instance = configService.getInstanceConfig().config
        assertThat(instance.fileSharing.outputFileUrlType.toString(), equalTo("s3"))

        val keys = configService.listOrganismKeys()
        assertThat(
            keys,
            containsInAnyOrder("dummyOrganism", "otherOrganism", "dummyOrganismWithoutConsensusSequences"),
        )
    }
}
