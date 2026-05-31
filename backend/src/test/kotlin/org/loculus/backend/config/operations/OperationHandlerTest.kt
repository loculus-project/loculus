package org.loculus.backend.config.operations

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.instanceOf
import org.junit.jupiter.api.Test
import org.loculus.backend.config.DataUseTerms
import org.loculus.backend.config.FileSharing
import org.loculus.backend.config.InstanceConfig
import org.loculus.backend.config.LinkOut
import org.loculus.backend.config.Metadata
import org.loculus.backend.config.MetadataType
import org.loculus.backend.config.OrganismConfig
import org.loculus.backend.config.OrganismImage
import org.loculus.backend.config.ReferenceGenome
import org.loculus.backend.config.Schema
import org.loculus.backend.config.operations.handlers.AddLinkOutHandler
import org.loculus.backend.config.operations.handlers.AddLinkOutPayload
import org.loculus.backend.config.operations.handlers.AddOptionalMetadataFieldHandler
import org.loculus.backend.config.operations.handlers.AddOptionalMetadataFieldPayload
import org.loculus.backend.config.operations.handlers.RemoveLinkOutHandler
import org.loculus.backend.config.operations.handlers.RemoveLinkOutPayload
import org.loculus.backend.config.operations.handlers.ReorderMetadataFieldsHandler
import org.loculus.backend.config.operations.handlers.ReorderMetadataFieldsPayload
import org.loculus.backend.config.operations.handlers.SetInstanceBrandingHandler
import org.loculus.backend.config.operations.handlers.SetInstanceBrandingPayload
import org.loculus.backend.config.operations.handlers.SetMetadataFieldDisplayHandler
import org.loculus.backend.config.operations.handlers.SetMetadataFieldDisplayPayload
import org.loculus.backend.config.operations.handlers.SetOrganismDisplayHandler
import org.loculus.backend.config.operations.handlers.SetOrganismDisplayPayload
import org.loculus.backend.config.operations.handlers.UpdateLinkOutHandler
import org.loculus.backend.config.operations.handlers.UpdateLinkOutPayload

class OperationHandlerTest {

    private val instance = InstanceConfig(
        name = "Loculus",
        accessionPrefix = "LOC_",
        dataUseTerms = DataUseTerms(enabled = false, urls = null),
        fileSharing = FileSharing(),
    )

    private val organism = OrganismConfig(
        schema = Schema(
            organismName = "Test",
            metadata = listOf(
                Metadata(name = "country", type = MetadataType.STRING),
                Metadata(name = "date", type = MetadataType.DATE, required = true),
            ),
        ),
        referenceGenome = ReferenceGenome(emptyList(), emptyList()),
    )

    @Test
    fun `SetInstanceBranding sets the name`() {
        val handler = SetInstanceBrandingHandler()
        val payload = SetInstanceBrandingPayload(name = "Pathoplexus")
        val draft = ConfigDocument.Instance(instance)

        assertThat(handler.validate(payload, draft), instanceOf(ValidationResult.Valid::class.java))
        val result = handler.apply(payload, draft) as ConfigDocument.Instance
        assertThat(result.config.name, equalTo("Pathoplexus"))
        assertThat(result.config.accessionPrefix, equalTo("LOC_")) // untouched
    }

    @Test
    fun `SetInstanceBranding rejects blank name`() {
        val handler = SetInstanceBrandingHandler()
        val result = handler.validate(SetInstanceBrandingPayload(name = "  "), ConfigDocument.Instance(instance))
        assertThat(result, instanceOf(ValidationResult.Invalid::class.java))
        val errors = (result as ValidationResult.Invalid).errors
        assertThat(errors.first().path, equalTo("name"))
    }

    @Test
    fun `SetInstanceBranding rejects organism-scope draft`() {
        val handler = SetInstanceBrandingHandler()
        val result = handler.validate(
            SetInstanceBrandingPayload(name = "X"),
            ConfigDocument.Organism(organism),
        )
        assertThat(result, instanceOf(ValidationResult.Invalid::class.java))
    }

    @Test
    fun `SetMetadataFieldDisplay updates displayName`() {
        val handler = SetMetadataFieldDisplayHandler()
        val payload = SetMetadataFieldDisplayPayload(field = "country", displayName = "Country of origin")
        val draft = ConfigDocument.Organism(organism)

        assertThat(handler.validate(payload, draft), instanceOf(ValidationResult.Valid::class.java))
        val result = handler.apply(payload, draft) as ConfigDocument.Organism
        val updated = result.config.schema.metadata.single { it.name == "country" }
        assertThat(updated.displayName, equalTo("Country of origin"))
    }

    @Test
    fun `SetMetadataFieldDisplay rejects nonexistent field`() {
        val handler = SetMetadataFieldDisplayHandler()
        val result = handler.validate(
            SetMetadataFieldDisplayPayload(field = "nonexistent", displayName = "X"),
            ConfigDocument.Organism(organism),
        )
        assertThat(result, instanceOf(ValidationResult.Invalid::class.java))
        val errors = (result as ValidationResult.Invalid).errors
        assertThat(errors.first().path, equalTo("field"))
    }

    @Test
    fun `SetOrganismDisplay updates top-level fields and leaves schema_organismName alone`() {
        val handler = SetOrganismDisplayHandler()
        val payload = SetOrganismDisplayPayload(
            displayName = "Sudan ebolavirus",
            description = "A virus",
            image = OrganismImage(url = "/img/sudan.png"),
        )
        val draft = ConfigDocument.Organism(organism)

        assertThat(handler.validate(payload, draft), instanceOf(ValidationResult.Valid::class.java))
        val result = handler.apply(payload, draft) as ConfigDocument.Organism
        assertThat(result.config.displayName, equalTo("Sudan ebolavirus"))
        assertThat(result.config.description, equalTo("A virus"))
        assertThat(result.config.image?.url, equalTo("/img/sudan.png"))
        // Schema.organismName is no longer mutated by this op; it retains the
        // value from the initial PUT.
        assertThat(result.config.schema.organismName, equalTo(organism.schema.organismName))
    }

    @Test
    fun `SetOrganismDisplay rejects blank display values`() {
        val handler = SetOrganismDisplayHandler()
        val result = handler.validate(
            SetOrganismDisplayPayload(displayName = "   ", image = OrganismImage(url = "")),
            ConfigDocument.Organism(organism),
        )
        assertThat(result, instanceOf(ValidationResult.Invalid::class.java))
        assertThat((result as ValidationResult.Invalid).errors.map { it.path }, contains("displayName", "image.url"))
    }

    @Test
    fun `ReorderMetadataFields reorders the existing list`() {
        val handler = ReorderMetadataFieldsHandler()
        val payload = ReorderMetadataFieldsPayload(order = listOf("date", "country"))
        val draft = ConfigDocument.Organism(organism)

        assertThat(handler.validate(payload, draft), instanceOf(ValidationResult.Valid::class.java))
        val result = handler.apply(payload, draft) as ConfigDocument.Organism
        assertThat(result.config.schema.metadata.map { it.name }, contains("date", "country"))
    }

    @Test
    fun `ReorderMetadataFields rejects missing or extra fields`() {
        val handler = ReorderMetadataFieldsHandler()
        val draft = ConfigDocument.Organism(organism)

        val missing = handler.validate(ReorderMetadataFieldsPayload(order = listOf("country")), draft)
        assertThat(missing, instanceOf(ValidationResult.Invalid::class.java))
        assertThat((missing as ValidationResult.Invalid).errors.first().message, equalTo("missing fields: date"))

        val extra = handler.validate(
            ReorderMetadataFieldsPayload(order = listOf("country", "date", "extra")),
            draft,
        )
        assertThat(extra, instanceOf(ValidationResult.Invalid::class.java))
        assertThat((extra as ValidationResult.Invalid).errors.first().message, equalTo("unknown fields: extra"))

        val dupes = handler.validate(
            ReorderMetadataFieldsPayload(order = listOf("country", "country")),
            draft,
        )
        assertThat(dupes, instanceOf(ValidationResult.Invalid::class.java))
    }

    @Test
    fun `AddLinkOut adds and rejects duplicates`() {
        val handler = AddLinkOutHandler()
        val link = LinkOut(name = "NCBI", url = "https://x/{accession}")
        val draft = ConfigDocument.Organism(organism)

        assertThat(handler.validate(AddLinkOutPayload(link), draft), instanceOf(ValidationResult.Valid::class.java))
        val after = handler.apply(AddLinkOutPayload(link), draft) as ConfigDocument.Organism
        assertThat(after.config.schema.linkOuts.map { it.name }, contains("NCBI"))

        val dupe = handler.validate(AddLinkOutPayload(link), after)
        assertThat(dupe, instanceOf(ValidationResult.Invalid::class.java))
        assertThat((dupe as ValidationResult.Invalid).errors.first().path, equalTo("linkOut.name"))
    }

    @Test
    fun `AddLinkOut rejects blank fields`() {
        val handler = AddLinkOutHandler()
        val result = handler.validate(
            AddLinkOutPayload(
                LinkOut(name = "", url = "", maxNumberOfRecommendedEntries = 0),
            ),
            ConfigDocument.Organism(organism),
        )
        assertThat(result, instanceOf(ValidationResult.Invalid::class.java))
        val errors = (result as ValidationResult.Invalid).errors
        assertThat(errors, hasSize(3))
    }

    @Test
    fun `UpdateLinkOut updates fields by name`() {
        val handler = UpdateLinkOutHandler()
        val existing = organism.copy(
            schema = organism.schema.copy(
                linkOuts = listOf(LinkOut(name = "NCBI", url = "https://x")),
            ),
        )
        val draft = ConfigDocument.Organism(existing)
        val payload = UpdateLinkOutPayload(name = "NCBI", url = "https://new")

        assertThat(handler.validate(payload, draft), instanceOf(ValidationResult.Valid::class.java))
        val result = handler.apply(payload, draft) as ConfigDocument.Organism
        val updated = result.config.schema.linkOuts.single()
        assertThat(updated.url, equalTo("https://new"))
        assertThat(updated.name, equalTo("NCBI")) // untouched
    }

    @Test
    fun `UpdateLinkOut rejects unknown name`() {
        val handler = UpdateLinkOutHandler()
        val result = handler.validate(
            UpdateLinkOutPayload(name = "nope", url = "https://x", maxNumberOfRecommendedEntries = 0),
            ConfigDocument.Organism(organism),
        )
        assertThat(result, instanceOf(ValidationResult.Invalid::class.java))
        val paths = (result as ValidationResult.Invalid).errors.map { it.path }
        assertThat(paths, contains("name", "maxNumberOfRecommendedEntries"))
    }

    @Test
    fun `RemoveLinkOut removes by name`() {
        val handler = RemoveLinkOutHandler()
        val existing = organism.copy(
            schema = organism.schema.copy(
                linkOuts = listOf(LinkOut(name = "NCBI", url = "https://x")),
            ),
        )
        val draft = ConfigDocument.Organism(existing)

        assertThat(
            handler.validate(RemoveLinkOutPayload(name = "NCBI"), draft),
            instanceOf(ValidationResult.Valid::class.java),
        )
        val result = handler.apply(RemoveLinkOutPayload(name = "NCBI"), draft) as ConfigDocument.Organism
        assertThat(result.config.schema.linkOuts, hasSize(0))
    }

    @Test
    fun `RemoveLinkOut rejects unknown name`() {
        val handler = RemoveLinkOutHandler()
        val result = handler.validate(
            RemoveLinkOutPayload(name = "nope"),
            ConfigDocument.Organism(organism),
        )
        assertThat(result, instanceOf(ValidationResult.Invalid::class.java))
    }

    @Test
    fun `AddOptionalMetadataField appends a new optional field`() {
        val handler = AddOptionalMetadataFieldHandler()
        val payload = AddOptionalMetadataFieldPayload(
            name = "host",
            type = MetadataType.STRING,
            displayName = "Host",
        )
        val draft = ConfigDocument.Organism(organism)

        assertThat(handler.validate(payload, draft), instanceOf(ValidationResult.Valid::class.java))
        val result = handler.apply(payload, draft) as ConfigDocument.Organism
        val added = result.config.schema.metadata.last()
        assertThat(added.name, equalTo("host"))
        assertThat(added.required, equalTo(false))
        assertThat(added.displayName, equalTo("Host"))
    }

    @Test
    fun `AddOptionalMetadataField rejects duplicate name`() {
        val handler = AddOptionalMetadataFieldHandler()
        val result = handler.validate(
            AddOptionalMetadataFieldPayload(name = "country", type = MetadataType.STRING),
            ConfigDocument.Organism(organism),
        )
        assertThat(result, instanceOf(ValidationResult.Invalid::class.java))
        assertThat(
            (result as ValidationResult.Invalid).errors.first().message,
            equalTo("field 'country' already exists"),
        )
    }
}
