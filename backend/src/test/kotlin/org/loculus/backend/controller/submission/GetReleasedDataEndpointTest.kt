package org.loculus.backend.controller.submission

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.BooleanNode
import com.fasterxml.jackson.databind.node.IntNode
import com.fasterxml.jackson.databind.node.NullNode
import com.fasterxml.jackson.databind.node.TextNode
import com.fasterxml.jackson.module.kotlin.readValue
import com.github.luben.zstd.ZstdInputStream
import com.ninjasquad.springmockk.MockkBean
import io.mockk.every
import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit
import kotlinx.datetime.Instant
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalDateTime
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.plus
import kotlinx.datetime.toInstant
import kotlinx.datetime.toLocalDateTime
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.greaterThan
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.matchesPattern
import org.hamcrest.Matchers.not
import org.hamcrest.Matchers.notNullValue
import org.jetbrains.exposed.sql.batchInsert
import org.jetbrains.exposed.sql.transactions.transaction
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.keycloak.representations.idm.UserRepresentation
import org.loculus.backend.api.AccessionVersionInterface
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsChangeRequest
import org.loculus.backend.api.GeneticSequence
import org.loculus.backend.api.ProcessedData
import org.loculus.backend.api.Status
import org.loculus.backend.api.VersionStatus
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.config.DataUseTermsUrls
import org.loculus.backend.config.readBackendConfig
import org.loculus.backend.controller.DEFAULT_GROUP
import org.loculus.backend.controller.DEFAULT_GROUP_CHANGED
import org.loculus.backend.controller.DEFAULT_GROUP_NAME
import org.loculus.backend.controller.DEFAULT_GROUP_NAME_CHANGED
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.datauseterms.DataUseTermsControllerClient
import org.loculus.backend.controller.dateMonthsFromNow
import org.loculus.backend.controller.expectNdjsonAndGetContent
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.jacksonObjectMapper
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.submission.GetReleasedDataEndpointWithDataUseTermsUrlTest.ConfigWithModifiedDataUseTermsUrlSpringConfig
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
import org.loculus.backend.service.KeycloakAdapter
import org.loculus.backend.service.submission.SequenceEntriesTable
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.DateProvider
import org.loculus.backend.utils.Version
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpHeaders.ETAG
import org.springframework.http.MediaType
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.MvcResult
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.header
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.shaded.org.awaitility.Awaitility.await

private val ADDED_FIELDS_WITH_UNKNOWN_VALUES_FOR_RELEASE = listOf(
    "releasedAtTimestamp",
    "submissionId",
    "submittedAtTimestamp",
    "groupId",
)

@EndpointTest
class GetReleasedDataEndpointTest(
    @Autowired private val convenienceClient: SubmissionConvenienceClient,
    @Autowired private val submissionControllerClient: SubmissionControllerClient,
    @Autowired private val groupClient: GroupManagementControllerClient,
    @Autowired private val dataUseTermsClient: DataUseTermsControllerClient,
) {
    private val currentYear = Clock.System.now().toLocalDateTime(DateProvider.timeZone).year
    private val currentDate = Clock.System.now().toLocalDateTime(DateProvider.timeZone).date.toString()

    @MockkBean
    lateinit var keycloakAdapter: KeycloakAdapter

    @BeforeEach
    fun setup() {
        every { keycloakAdapter.getUsersWithName(any()) } returns listOf(UserRepresentation())
    }

    @Test
    fun `GIVEN no sequence entries in database THEN returns empty response & etag in header`() {
        val response = submissionControllerClient.getReleasedData()

        val responseBody = response.expectNdjsonAndGetContent<ProcessedData<GeneticSequence>>()
        assertThat(responseBody, `is`(emptyList()))
        response.andExpect(status().isOk)
            .andExpect(header().string(ETAG, notNullValue()))
            .andExpect(header().string("x-total-records", `is`("0")))
    }

    @Test
    fun `GIVEN released data exists THEN returns it with additional metadata fields`() {
        val groupId = groupClient.createNewGroup(group = DEFAULT_GROUP, jwt = jwtForDefaultUser)
            .andExpect(status().isOk)
            .andGetGroupId()

        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease(groupId = groupId)

        groupClient.updateGroup(
            groupId = groupId,
            group = DEFAULT_GROUP_CHANGED,
            jwt = jwtForDefaultUser,
        )

        val response = submissionControllerClient.getReleasedData()

        val responseBody = response.expectNdjsonAndGetContent<ProcessedData<GeneticSequence>>()

        assertThat(responseBody.size, `is`(NUMBER_OF_SEQUENCES))

        response.andExpect(header().string("x-total-records", NUMBER_OF_SEQUENCES.toString()))

        responseBody.forEach {
            val id = it.metadata["accession"]!!.asText()
            val version = it.metadata["version"]!!.asLong()
            assertThat(version, `is`(1L))

            val expectedMetadata = defaultProcessedData.metadata + mapOf(
                "accession" to TextNode(id),
                "version" to IntNode(version.toInt()),
                "accessionVersion" to TextNode("$id.$version"),
                "isRevocation" to BooleanNode.FALSE,
                "submitter" to TextNode(DEFAULT_USER_NAME),
                "groupName" to TextNode(DEFAULT_GROUP_NAME_CHANGED),
                "versionStatus" to TextNode("LATEST_VERSION"),
                "dataUseTerms" to TextNode("OPEN"),
                "releasedDate" to TextNode(currentDate),
                "submittedDate" to TextNode(currentDate),
                "dataUseTermsRestrictedUntil" to NullNode.getInstance(),
            )

            for ((key, value) in it.metadata) {
                when (key) {
                    "submittedAtTimestamp" -> expectIsTimestampWithCurrentYear(value)
                    "releasedAtTimestamp" -> expectIsTimestampWithCurrentYear(value)
                    "submissionId" -> assertThat(value.textValue(), matchesPattern("^custom\\d$"))
                    "groupId" -> assertThat(value.intValue(), `is`(groupId))
                    else -> assertThat(value, `is`(expectedMetadata[key]))
                }
            }
            assertThat(it.alignedNucleotideSequences, `is`(defaultProcessedData.alignedNucleotideSequences))
            assertThat(it.unalignedNucleotideSequences, `is`(defaultProcessedData.unalignedNucleotideSequences))
            assertThat(it.alignedAminoAcidSequences, `is`(defaultProcessedData.alignedAminoAcidSequences))
            assertThat(it.nucleotideInsertions, `is`(defaultProcessedData.nucleotideInsertions))
            assertThat(it.aminoAcidInsertions, `is`(defaultProcessedData.aminoAcidInsertions))
        }
    }

    @Test
    fun `GIVEN header etag equal etag from last db update THEN respond with 304, ELSE respond with data and etag`() {
        convenienceClient.prepareDefaultSequenceEntriesToApprovedForRelease()

        val response = submissionControllerClient.getReleasedData()
        val responseBody = response.expectNdjsonAndGetContent<ProcessedData<GeneticSequence>>()

        val mvcResult: MvcResult = response.andReturn()

        val initialEtag = mvcResult.response.getHeader(ETAG)
        assertThat(responseBody.size, `is`(NUMBER_OF_SEQUENCES))

        val responseNoNewData = submissionControllerClient.getReleasedData(
            ifNoneMatch = initialEtag,
        )
        responseNoNewData.andExpect(status().isNotModified)
            .andExpect(header().doesNotExist(ETAG))

        prepareRevokedAndRevocationAndRevisedVersions()

        val responseAfterMoreDataAdded = submissionControllerClient.getReleasedData(
            ifNoneMatch = initialEtag,
        )

        responseAfterMoreDataAdded.andExpect(status().isOk)
            .andExpect(header().string(ETAG, notNullValue()))
            .andExpect(header().string(ETAG, greaterThan(initialEtag)))

        val responseBodyMoreData = responseAfterMoreDataAdded
            .expectNdjsonAndGetContent<ProcessedData<GeneticSequence>>()
        assertThat(responseBodyMoreData.size, greaterThan(NUMBER_OF_SEQUENCES))
    }

    @Test
    fun `GIVEN released data exists in multiple versions THEN the 'versionStatus' flag is set correctly`() {
        val (
            accession,
            revokedVersion1,
            revokedVersion2,
            revocationVersion3,
            revisedVersion4,
            latestVersion5,
        ) = prepareRevokedAndRevocationAndRevisedVersions()

        val response =
            submissionControllerClient.getReleasedData().expectNdjsonAndGetContent<ProcessedData<GeneticSequence>>()

        assertThat(
            response.findAccessionVersionStatus(accession, revokedVersion1),
            `is`(VersionStatus.REVOKED.name),
        )
        assertThat(
            response.findAccessionVersionStatus(accession, revokedVersion2),
            `is`(VersionStatus.REVOKED.name),
        )
        assertThat(
            response.findAccessionVersionStatus(accession, revocationVersion3),
            `is`(VersionStatus.REVISED.name),
        )
        assertThat(
            response.findAccessionVersionStatus(accession, revisedVersion4),
            `is`(VersionStatus.REVISED.name),
        )
        assertThat(
            response.findAccessionVersionStatus(accession, latestVersion5),
            `is`(VersionStatus.LATEST_VERSION.name),
        )
    }

    @Test
    fun `GIVEN preprocessing pipeline submitted with missing metadata fields THEN fields are filled with null`() {
        val absentFields = listOf("dateSubmitted", "division", "host", "age", "sex", "qc")

        val accessVersions = convenienceClient.prepareDefaultSequenceEntriesToInProcessing()
        convenienceClient.submitProcessedData(
            accessVersions.map {
                PreparedProcessedData.withMissingMetadataFields(
                    accession = it.accession,
                    version = it.version,
                    absentFields = absentFields,
                )
            },
        )
        convenienceClient.approveProcessedSequenceEntries(accessVersions)

        val firstSequenceEntry =
            submissionControllerClient.getReleasedData().expectNdjsonAndGetContent<ProcessedData<GeneticSequence>>()[0]

        for (absentField in absentFields) {
            assertThat(firstSequenceEntry.metadata[absentField], `is`(NullNode.instance))
        }
    }

    @Test
    fun `GIVEN revocation version THEN all data is present but mostly null`() {
        convenienceClient.prepareRevokedSequenceEntries()

        val revocationEntry = submissionControllerClient.getReleasedData()
            .expectNdjsonAndGetContent<ProcessedData<GeneticSequence>>()
            .find { it.metadata["isRevocation"]!!.asBoolean() }!!

        for ((key, value) in revocationEntry.metadata) {
            when (key) {
                "isRevocation" -> assertThat(value, `is`(BooleanNode.TRUE))
                "versionStatus" -> assertThat(value, `is`(TextNode("LATEST_VERSION")))
                "submittedAtTimestamp" -> expectIsTimestampWithCurrentYear(value)
                "releasedAtTimestamp" -> expectIsTimestampWithCurrentYear(value)
                "submitter" -> assertThat(value, `is`(TextNode(DEFAULT_USER_NAME)))
                "groupName" -> assertThat(value, `is`(TextNode(DEFAULT_GROUP_NAME)))
                "groupId" -> assertThat(value.intValue(), `is`(greaterThan(0)))
                "accession", "version", "accessionVersion", "submissionId" -> {}
                "dataUseTerms" -> assertThat(value, `is`(TextNode("OPEN")))
                "submittedDate" -> assertThat(value, `is`(TextNode(currentDate)))
                "releasedDate" -> assertThat(value, `is`(TextNode(currentDate)))
                "versionComment" -> assertThat(
                    value,
                    `is`(TextNode("This is a test revocation")),
                )

                else -> assertThat("value for $key", value, `is`(NullNode.instance))
            }
        }

        val expectedNucleotideSequences = mapOf(
            MAIN_SEGMENT to null,
        )
        assertThat(revocationEntry.alignedNucleotideSequences, `is`(expectedNucleotideSequences))
        assertThat(revocationEntry.unalignedNucleotideSequences, `is`(expectedNucleotideSequences))

        val expectedAminoAcidSequences = mapOf(
            SOME_LONG_GENE to null,
            SOME_SHORT_GENE to null,
        )
        assertThat(revocationEntry.alignedAminoAcidSequences, `is`(expectedAminoAcidSequences))

        val expectedNucleotideInsertions = mapOf(
            MAIN_SEGMENT to emptyList<String>(),
        )
        assertThat(revocationEntry.nucleotideInsertions, `is`(expectedNucleotideInsertions))

        val expectedAminoAcidInsertions = mapOf(
            SOME_LONG_GENE to emptyList<String>(),
            SOME_SHORT_GENE to emptyList(),
        )
        assertThat(revocationEntry.aminoAcidInsertions, `is`(expectedAminoAcidInsertions))
    }

    @Test
    fun `WHEN I request zstd compressed data THEN should return zstd compressed data`() {
        convenienceClient.prepareDataTo(Status.APPROVED_FOR_RELEASE)

        val response = submissionControllerClient.getReleasedData(compression = "zstd")
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_NDJSON_VALUE))
            .andExpect(header().string(HttpHeaders.CONTENT_ENCODING, "zstd"))
            .andReturn()
            .response
        await().until {
            response.isCommitted
        }
        val content = response.contentAsByteArray

        val decompressedContent = ZstdInputStream(content.inputStream())
            .apply { continuous = true }
            .readAllBytes()
            .decodeToString()

        val data = decompressedContent.lines()
            .filter { it.isNotBlank() }
            .map { jacksonObjectMapper.readValue<ProcessedData<GeneticSequence>>(it) }

        assertThat(data, hasSize(NUMBER_OF_SEQUENCES))
        assertThat(data[0].metadata, `is`(not(emptyMap())))
    }

    /**
     * This test ist relevant for EarliestReleaseDateFinder which relies on this particular ordering to be returned.
     */
    @Test
    fun `GIVEN multiple accessions with multiple versions THEN results are ordered by accession and version`() {
        val now = Clock.System.now().toLocalDateTime(TimeZone.UTC)
        val accessions = listOf<Accession>("SEQ1", "SEQ2", "SEQ3", "SEQ4")
        val versions = listOf<Version>(1L, 2L, 3L)
        val accessionVersions = accessions.flatMap { versions.map(it::to) }

        transaction {
            val submittingGroupId = groupClient.createNewGroup()
                .andExpect(status().isOk)
                .andGetGroupId()

            SequenceEntriesTable.batchInsert(accessionVersions.shuffled()) { (accession, version) ->
                this[SequenceEntriesTable.accessionColumn] = accession
                this[SequenceEntriesTable.versionColumn] = version
                this[SequenceEntriesTable.groupIdColumn] = submittingGroupId
                this[SequenceEntriesTable.submittedAtTimestampColumn] = now
                this[SequenceEntriesTable.releasedAtTimestampColumn] = now
                this[SequenceEntriesTable.organismColumn] = DEFAULT_ORGANISM
                this[SequenceEntriesTable.submissionIdColumn] = "foo"
                this[SequenceEntriesTable.submitterColumn] = "bar"
                this[SequenceEntriesTable.approverColumn] = "baz"
            }

            dataUseTermsClient.changeDataUseTerms(DataUseTermsChangeRequest(accessions, DataUseTerms.Open))
        }

        val data = convenienceClient.getReleasedData(DEFAULT_ORGANISM)

        // assert that the accessions are sorted
        assertThat(data.size, Matchers.`is`(12))
        val actualAccessionOrder = data.map { it.metadata["accession"]!!.asText() }
        assertThat(actualAccessionOrder, equalTo(actualAccessionOrder.sorted()))

        // assert that _within_ each accession block, it's sorted by version
        val accessionChunks = data.groupBy { it.metadata["accession"]!!.asText() }
        assertThat(accessionChunks.size, Matchers.`is`(accessions.size))
        accessionChunks.values
            .map { chunk -> chunk.map { it.metadata["version"]!!.asLong() } }
            .forEach { assertThat(it, equalTo(it.sorted())) }
    }

    private fun prepareRevokedAndRevocationAndRevisedVersions(): PreparedVersions {
        val preparedSubmissions = convenienceClient.prepareDataTo(Status.APPROVED_FOR_RELEASE)
        convenienceClient.reviseAndProcessDefaultSequenceEntries(preparedSubmissions.map { it.accession })

        val revokedSequences = convenienceClient.revokeSequenceEntries(preparedSubmissions.map { it.accession })
        convenienceClient.approveProcessedSequenceEntries(revokedSequences)

        convenienceClient.reviseAndProcessDefaultSequenceEntries(revokedSequences.map { it.accession })

        convenienceClient.reviseAndProcessDefaultSequenceEntries(revokedSequences.map { it.accession })

        return PreparedVersions(
            accession = preparedSubmissions.first().accession,
            revokedVersion1 = 1L,
            revokedVersion2 = 2L,
            revocationVersion3 = 3L,
            revisedVersion4 = 4L,
            latestVersion5 = 5L,
        )
    }

    private fun expectIsTimestampWithCurrentYear(value: JsonNode) {
        val dateTime = Instant.fromEpochSeconds(value.asLong()).toLocalDateTime(DateProvider.timeZone)
        assertThat(dateTime.year, `is`(currentYear))
    }
}

private const val OPEN_DATA_USE_TERMS_URL = "openUrl"
private const val RESTRICTED_DATA_USE_TERMS_URL = "restrictedUrl"

@EndpointTest
@Import(ConfigWithModifiedDataUseTermsUrlSpringConfig::class)
@TestPropertySource(properties = ["spring.main.allow-bean-definition-overriding=true"])
class GetReleasedDataEndpointWithDataUseTermsUrlTest(
    @Autowired val convenienceClient: SubmissionConvenienceClient,
    @Autowired val dataUseTermsClient: DataUseTermsControllerClient,
    @Autowired val submissionControllerClient: SubmissionControllerClient,
) {
    @MockkBean
    private lateinit var dateProvider: DateProvider

    @BeforeEach
    fun setup() {
        every { dateProvider.getCurrentDateTime() } answers { callOriginal() }
        every { dateProvider.getCurrentDate() } answers { callOriginal() }
    }

    @Test
    fun `GIVEN sequence entry WHEN I change data use terms THEN returns updated data use terms`() {
        every { dateProvider.getCurrentInstant() } answers { callOriginal() }

        val threeMonthsFromNow = dateMonthsFromNow(3)

        var accessionVersion = convenienceClient.prepareDataTo(
            status = Status.APPROVED_FOR_RELEASE,
            dataUseTerms = DataUseTerms.Restricted(threeMonthsFromNow),
        )[0]

        assertAccessionVersionIsRestrictedUntil(accessionVersion, threeMonthsFromNow)

        val oneMonthFromNow = dateMonthsFromNow(1)
        dataUseTermsClient.changeDataUseTerms(
            newDataUseTerms = DataUseTermsChangeRequest(
                accessions = listOf(accessionVersion.accession),
                newDataUseTerms = DataUseTerms.Restricted(oneMonthFromNow),
            ),
            jwt = jwtForDefaultUser,
        )

        assertAccessionVersionIsRestrictedUntil(accessionVersion, oneMonthFromNow)

        dataUseTermsClient.changeDataUseTerms(
            newDataUseTerms = DataUseTermsChangeRequest(
                accessions = listOf(accessionVersion.accession),
                newDataUseTerms = DataUseTerms.Open,
            ),
            jwt = jwtForDefaultUser,
        )

        assertAccessionVersionIsOpen(accessionVersion)
    }

    @Test
    fun `GIVEN sequence entry with expired restricted data use terms THEN returns open data use terms`() {
        every { dateProvider.getCurrentInstant() } answers { callOriginal() }

        val threeMonthsFromNow = dateMonthsFromNow(3)

        var accessionVersion = convenienceClient.prepareDataTo(
            status = Status.APPROVED_FOR_RELEASE,
            dataUseTerms = DataUseTerms.Restricted(threeMonthsFromNow),
        )[0]

        assertAccessionVersionIsRestrictedUntil(accessionVersion, threeMonthsFromNow)

        val threeMonthsAndADayFromNow = LocalDateTime(
            date = dateMonthsFromNow(3).plus(1, DateTimeUnit.DAY),
            time = LocalTime.fromSecondOfDay(0),
        ).toInstant(DateProvider.timeZone)
        every { dateProvider.getCurrentInstant() } answers { threeMonthsAndADayFromNow }

        assertAccessionVersionIsOpen(accessionVersion)
    }

    private fun assertAccessionVersionIsOpen(accessionVersion: AccessionVersionInterface) {
        assertAccessionVersionHasReleasedDataValues(
            accessionVersion = accessionVersion,
            dataUseTerms = "OPEN",
            restrictedUntilDate = null,
            dataUseTermsUrl = OPEN_DATA_USE_TERMS_URL,
        )
    }

    private fun assertAccessionVersionIsRestrictedUntil(
        accessionVersion: AccessionVersionInterface,
        restrictedUntilDate: LocalDate,
    ) {
        assertAccessionVersionHasReleasedDataValues(
            accessionVersion = accessionVersion,
            dataUseTerms = "RESTRICTED",
            restrictedUntilDate = restrictedUntilDate,
            dataUseTermsUrl = RESTRICTED_DATA_USE_TERMS_URL,
        )
    }

    private fun assertAccessionVersionHasReleasedDataValues(
        accessionVersion: AccessionVersionInterface,
        dataUseTerms: String,
        restrictedUntilDate: LocalDate?,
        dataUseTermsUrl: String,
    ) {
        val releasedData = submissionControllerClient.getReleasedData()
            .expectNdjsonAndGetContent<ProcessedData<GeneticSequence>>()
            .find { it.metadata["accessionVersion"]?.textValue() == accessionVersion.displayAccessionVersion() }!!

        assertThat(releasedData.metadata["dataUseTerms"]?.textValue(), `is`(dataUseTerms))
        when (restrictedUntilDate) {
            null -> assertThat(releasedData.metadata["dataUseTermsRestrictedUntil"], `is`(NullNode.instance))
            else -> assertThat(
                releasedData.metadata["dataUseTermsRestrictedUntil"]?.textValue(),
                `is`(restrictedUntilDate.toString()),
            )
        }
        assertThat(releasedData.metadata["dataUseTermsUrl"]?.textValue(), `is`(dataUseTermsUrl))
    }

    @TestConfiguration
    class ConfigWithModifiedDataUseTermsUrlSpringConfig {
        @Bean
        @Primary
        fun backendConfig(
            objectMapper: ObjectMapper,
            @Value("\${${BackendSpringProperty.BACKEND_CONFIG_PATH}}") configPath: String,
        ): BackendConfig {
            val originalConfig = readBackendConfig(objectMapper = objectMapper, configPath = configPath)

            return originalConfig.copy(
                dataUseTermsUrls = DataUseTermsUrls(
                    open = OPEN_DATA_USE_TERMS_URL,
                    restricted = RESTRICTED_DATA_USE_TERMS_URL,
                ),
            )
        }
    }
}

private fun List<ProcessedData<GeneticSequence>>.findAccessionVersionStatus(
    accession: Accession,
    version: Version,
): String {
    val processedData =
        find { it.metadata["accession"]?.asText() == accession && it.metadata["version"]?.asLong() == version }
            ?: error("Could not find accession version $accession.$version")

    return processedData.metadata["versionStatus"]!!.asText()
}

data class PreparedVersions(
    val accession: Accession,
    val revokedVersion1: Version,
    val revokedVersion2: Version,
    val revocationVersion3: Version,
    val revisedVersion4: Version,
    val latestVersion5: Version,
)
