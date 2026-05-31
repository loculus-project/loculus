package org.loculus.backend.config

import com.fasterxml.jackson.annotation.JsonProperty
import org.apache.commons.lang3.StringUtils.lowerCase

data class InstanceConfig(
    val name: String,
    val accessionPrefix: String,
    val dataUseTerms: DataUseTerms = DataUseTerms(enabled = false, urls = null),
    val fileSharing: FileSharing = FileSharing(),
    val description: String? = null,
    val logo: Logo? = null,
    val supportContact: SupportContact? = null,
    val bannerMessage: String? = null,
    val bannerMessageURL: String? = null,
    val submissionBannerMessage: String? = null,
    val submissionBannerMessageURL: String? = null,
    val welcomeMessageHTML: String? = null,
    val additionalHeadHTML: String? = null,
    val gitHubEditLink: String? = null,
    val gitHubMainUrl: String? = null,
    val gitHubIssuesUrl: String? = null,
    val issuesEmail: String? = null,
    val enableSeqSets: Boolean = false,
    val seqSetsFieldsToDisplay: List<FieldToDisplay>? = null,
    val seqSetsGraphs: List<SeqSetGraph>? = null,
    val enableLoginNavigationItem: Boolean = true,
    val enableSubmissionNavigationItem: Boolean = true,
    val enableSubmissionPages: Boolean = true,
    val dataUseTermsAgreementHTML: String? = null,
    val sequenceFlagging: SequenceFlaggingConfig? = null,
    val dateFieldForGroupGraph: String? = null,
    // Map: lineage system key (e.g. `pangoLineage`) → pipeline version (string) → definition-file URL.
    val lineageSystemDefinitions: Map<String, Map<String, String>>? = null,
)

data class Logo(val url: String, val alt: String? = null, val height: Int? = null, val width: Int? = null)

data class SupportContact(val email: String? = null, val url: String? = null)

data class FieldToDisplay(val field: String, val displayName: String)

data class SeqSetGraph(val name: String, val displayName: String, val type: SeqSetGraphType, val fields: List<String>)

enum class SeqSetGraphType {
    @JsonProperty("date")
    DATE,

    @JsonProperty("category")
    CATEGORY,

    ;

    override fun toString(): String = lowerCase(name)
}

data class SequenceFlaggingConfig(val github: GithubSequenceFlagging)

data class GithubSequenceFlagging(val organization: String, val repository: String, val issueTemplate: String? = null)

val DEFAULT_INSTANCE_CONFIG = InstanceConfig(
    name = "Loculus",
    accessionPrefix = "LOC_",
    dataUseTerms = DataUseTerms(enabled = false, urls = null),
    fileSharing = FileSharing(),
)

const val DEFAULT_INSTANCE_CONFIG_JSON = """{"name":"Loculus","accessionPrefix":"LOC_",""" +
    """"dataUseTerms":{"enabled":false,"urls":null},""" +
    """"fileSharing":{"outputFileUrlType":"website"},""" +
    """"description":null,"logo":null,"supportContact":null,""" +
    """"bannerMessage":null,"bannerMessageURL":null,""" +
    """"submissionBannerMessage":null,"submissionBannerMessageURL":null,""" +
    """"welcomeMessageHTML":null,"additionalHeadHTML":null,""" +
    """"gitHubEditLink":null,"gitHubMainUrl":null,"gitHubIssuesUrl":null,"issuesEmail":null,""" +
    """"enableSeqSets":false,"seqSetsFieldsToDisplay":null,"seqSetsGraphs":null,""" +
    """"enableLoginNavigationItem":true,"enableSubmissionNavigationItem":true,"enableSubmissionPages":true,""" +
    """"dataUseTermsAgreementHTML":null,"sequenceFlagging":null,"dateFieldForGroupGraph":null,""" +
    """"lineageSystemDefinitions":null}"""
