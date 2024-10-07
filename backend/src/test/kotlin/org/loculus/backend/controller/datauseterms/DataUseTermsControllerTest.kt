package org.loculus.backend.controller.datauseterms

import org.hamcrest.CoreMatchers.containsString
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsChangeRequest
import org.loculus.backend.api.DataUseTermsType
import org.loculus.backend.controller.DEFAULT_USER_NAME
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.dateMonthsFromNow
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.generateJwtFor
import org.loculus.backend.controller.jwtForSuperUser
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.ResultMatcher
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class DataUseTermsControllerTest(
    @Autowired private val client: DataUseTermsControllerClient,
    @Autowired private val submissionConvenienceClient: SubmissionConvenienceClient,
) {

    @Test
    fun `WHEN I get data use terms of non-existing accession THEN returns unprocessable entity`() {
        val nonExistingAccession = "SomeNonExistingAccession"

        client.getDataUseTerms(nonExistingAccession)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail", containsString("Accession $nonExistingAccession not found")),
            )
    }

    @Test
    fun `GIVEN open submission WHEN getting data use terms THEN return history with one OPEN entry`() {
        val firstAccession = submissionConvenienceClient.submitDefaultFiles().submissionIdMappings.first().accession

        client.getDataUseTerms(firstAccession)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$").isArray)
            .andExpect(jsonPath("\$").isNotEmpty)
            .andExpect(jsonPath("\$[0].accession").value(firstAccession))
            .andExpect(jsonPath("\$[0].changeDate", containsString(dateMonthsFromNow(0).toString())))
            .andExpect(jsonPath("\$[0].dataUseTerms.type").value(DataUseTermsType.OPEN.name))
    }

    @Test
    fun `GIVEN changes in data use terms WHEN getting data use terms THEN return full history`() {
        val firstAccession = submissionConvenienceClient
            .submitDefaultFiles(dataUseTerms = DataUseTerms.Restricted(dateMonthsFromNow(6)))
            .submissionIdMappings
            .first()
            .accession

        client.changeDataUseTerms(
            DataUseTermsChangeRequest(
                accessions = listOf(firstAccession),
                newDataUseTerms = DataUseTerms.Open,
            ),
        )

        client.getDataUseTerms(firstAccession)
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$").isArray)
            .andExpect(jsonPath("\$[0].accession").value(firstAccession))
            .andExpect(jsonPath("\$[0].changeDate", containsString(dateMonthsFromNow(0).toString())))
            .andExpect(jsonPath("\$[0].dataUseTerms.type").value(DataUseTermsType.RESTRICTED.name))
            .andExpect(jsonPath("\$[0].dataUseTerms.restrictedUntil").value(dateMonthsFromNow(6).toString()))
            .andExpect(jsonPath("\$[1].accession").value(firstAccession))
            .andExpect(jsonPath("\$[1].dataUseTerms.type").value(DataUseTermsType.OPEN.name))
    }

    @ParameterizedTest
    @MethodSource("authorizationTestCases")
    fun `GIVEN invalid authorization token WHEN performing action THEN returns 401 Unauthorized`(
        authScenario: AuthScenario,
    ) {
        expectUnauthorizedResponse(isModifyingRequest = authScenario.isModifying) {
            authScenario.testFunction(it, client)
        }
    }

    @Test
    fun `GIVEN non-existing accessions WHEN setting new data use terms THEN return unprocessable entity`() {
        client.changeDataUseTerms(DEFAULT_DATA_USE_CHANGE_REQUEST)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail", containsString("Accessions 1, 2 do not exist")),
            )
    }

    @ParameterizedTest
    @MethodSource("dataUseTermsTestCases")
    fun `WHEN changing data use terms THEN show success or error`(testCase: DataUseTermsTestCase) {
        val accessions = submissionConvenienceClient
            .submitDefaultFiles(dataUseTerms = testCase.setupDataUseTerms)
            .submissionIdMappings
            .map { it.accession }

        val result = client.changeDataUseTerms(
            DataUseTermsChangeRequest(
                accessions = accessions,
                newDataUseTerms = testCase.newDataUseTerms,
            ),
        )
            .andExpect(testCase.expectedStatus)

        if (testCase.expectedContentType != null && testCase.expectedDetailContains != null) {
            result
                .andExpect(content().contentType(testCase.expectedContentType))
                .andExpect(jsonPath("\$.detail", containsString(testCase.expectedDetailContains)))
        }
    }

    @Test
    fun `WHEN I want to change data use terms of an entry of another group THEN is forbidden`() {
        val accessions = submissionConvenienceClient
            .submitDefaultFiles(username = DEFAULT_USER_NAME)
            .submissionIdMappings
            .map { it.accession }

        client.changeDataUseTerms(
            DataUseTermsChangeRequest(
                accessions = accessions,
                newDataUseTerms = DataUseTerms.Open,
            ),
            jwt = generateJwtFor("user that is not a member of the group"),
        )
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.detail", containsString("not a member of group(s)")))
    }

    @Test
    fun `WHEN superuser changes data use terms of an entry of other group THEN is successful`() {
        val accessions = submissionConvenienceClient
            .submitDefaultFiles(username = DEFAULT_USER_NAME)
            .submissionIdMappings
            .map { it.accession }

        client.changeDataUseTerms(
            DataUseTermsChangeRequest(
                accessions = accessions,
                newDataUseTerms = DataUseTerms.Open,
            ),
            jwt = jwtForSuperUser,
        )
            .andExpect(status().isNoContent)

        client.getDataUseTerms(accession = accessions.first())
            .andExpect(jsonPath("\$[0].accession").value(accessions.first()))
            .andExpect(jsonPath("\$[0].dataUseTerms.type").value(DataUseTermsType.OPEN.name))
    }

    companion object {
        data class AuthScenario(
            val testFunction: (String?, DataUseTermsControllerClient) -> ResultActions,
            val isModifying: Boolean,
        )

        @JvmStatic
        fun authorizationTestCases(): List<AuthScenario> = listOf(
            AuthScenario(
                { jwt, client ->
                    client.changeDataUseTerms(
                        newDataUseTerms = DEFAULT_DATA_USE_CHANGE_REQUEST,
                        jwt = jwt,
                    )
                },
                true,
            ),
        )

        data class DataUseTermsTestCase(
            val setupDataUseTerms: DataUseTerms,
            val newDataUseTerms: DataUseTerms,
            val expectedStatus: ResultMatcher,
            val expectedContentType: String?,
            val expectedDetailContains: String?,
        )

        @JvmStatic
        fun dataUseTermsTestCases(): List<DataUseTermsTestCase> = listOf(
            DataUseTermsTestCase(
                setupDataUseTerms = DataUseTerms.Open,
                newDataUseTerms = DataUseTerms.Open,
                expectedStatus = status().isNoContent,
                expectedContentType = null,
                expectedDetailContains = null,
            ),
            DataUseTermsTestCase(
                setupDataUseTerms = DataUseTerms.Open,
                newDataUseTerms = DataUseTerms.Restricted(dateMonthsFromNow(6)),
                expectedStatus = status().isUnprocessableEntity,
                expectedContentType = MediaType.APPLICATION_JSON_VALUE,
                expectedDetailContains = "Cannot change data use terms from OPEN to RESTRICTED.",
            ),
            DataUseTermsTestCase(
                setupDataUseTerms = DataUseTerms.Restricted(dateMonthsFromNow(6)),
                newDataUseTerms = DataUseTerms.Restricted(dateMonthsFromNow(-1)),
                expectedStatus = status().isBadRequest,
                expectedContentType = MediaType.APPLICATION_JSON_VALUE,
                expectedDetailContains = "The date 'restrictedUntil' must be in the future, " +
                    "up to a maximum of 1 year from now.",
            ),
            DataUseTermsTestCase(
                setupDataUseTerms = DataUseTerms.Restricted(dateMonthsFromNow(6)),
                newDataUseTerms = DataUseTerms.Restricted(dateMonthsFromNow(7)),
                expectedStatus = status().isUnprocessableEntity,
                expectedContentType = MediaType.APPLICATION_JSON_VALUE,
                expectedDetailContains = "Cannot extend restricted data use period. " +
                    "Please choose a date before ${dateMonthsFromNow(6)}.",
            ),
        )
    }
}
