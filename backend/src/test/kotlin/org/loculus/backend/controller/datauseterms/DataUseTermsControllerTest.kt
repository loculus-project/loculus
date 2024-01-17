package org.loculus.backend.controller.datauseterms

import kotlinx.datetime.Clock
import kotlinx.datetime.DateTimeUnit.Companion.MONTH
import kotlinx.datetime.TimeZone
import kotlinx.datetime.plus
import kotlinx.datetime.toLocalDateTime
import org.hamcrest.CoreMatchers.containsString
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.MethodSource
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsChangeRequest
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.expectUnauthorizedResponse
import org.loculus.backend.controller.submission.SubmissionConvenienceClient
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.ResultMatcher
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

private fun dateMonthsFromNow(months: Int) = Clock.System.now().toLocalDateTime(TimeZone.UTC).date.plus(months, MONTH)

@EndpointTest
class DataUseTermsControllerTest(
    @Autowired private val client: DataUseTermsControllerClient,
    @Autowired private val submissionConvenienceClient: SubmissionConvenienceClient,
) {

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
    fun `test data use terms changes`(testCase: DataUseTermsTestCase) {
        submissionConvenienceClient.submitDefaultFiles(dataUseTerms = testCase.setupDataUseTerms)

        val result = client.changeDataUseTerms(testCase.changeRequest)
            .andExpect(testCase.expectedStatus)

        if (testCase.expectedContentType != null && testCase.expectedDetailContains != null) {
            result
                .andExpect(content().contentType(testCase.expectedContentType))
                .andExpect(jsonPath("\$.detail", containsString(testCase.expectedDetailContains)))
        }
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
            val changeRequest: DataUseTermsChangeRequest,
            val expectedStatus: ResultMatcher,
            val expectedContentType: String?,
            val expectedDetailContains: String?,
        )

        @JvmStatic
        fun dataUseTermsTestCases(): List<DataUseTermsTestCase> {
            return listOf(
                DataUseTermsTestCase(
                    setupDataUseTerms = DataUseTerms.Open,
                    changeRequest = DEFAULT_DATA_USE_CHANGE_REQUEST,
                    expectedStatus = status().isNoContent,
                    expectedContentType = null,
                    expectedDetailContains = null,
                ),
                DataUseTermsTestCase(
                    setupDataUseTerms = DataUseTerms.Open,
                    changeRequest = DataUseTermsChangeRequest(
                        accessions = listOf("1", "2"),
                        newDataUseTerms = DataUseTerms.Restricted(dateMonthsFromNow(6)),
                    ),
                    expectedStatus = status().isUnprocessableEntity,
                    expectedContentType = MediaType.APPLICATION_JSON_VALUE,
                    expectedDetailContains = "Cannot change data use terms from OPEN to RESTRICTED.",
                ),
                DataUseTermsTestCase(
                    setupDataUseTerms = DataUseTerms.Restricted(dateMonthsFromNow(6)),
                    changeRequest = DataUseTermsChangeRequest(
                        accessions = listOf("1", "2"),
                        newDataUseTerms = DataUseTerms.Restricted(dateMonthsFromNow(-1)),
                    ),
                    expectedStatus = status().isBadRequest,
                    expectedContentType = MediaType.APPLICATION_JSON_VALUE,
                    expectedDetailContains = "The date 'restrictedUntil' must be in the future, " +
                        "up to a maximum of 1 year from now.",
                ),
                DataUseTermsTestCase(
                    setupDataUseTerms = DataUseTerms.Restricted(dateMonthsFromNow(6)),
                    changeRequest = DataUseTermsChangeRequest(
                        accessions = listOf("1", "2"),
                        newDataUseTerms = DataUseTerms.Restricted(dateMonthsFromNow(7)),
                    ),
                    expectedStatus = status().isUnprocessableEntity,
                    expectedContentType = MediaType.APPLICATION_JSON_VALUE,
                    expectedDetailContains = "Cannot extend restricted data use period. " +
                        "Please choose a date before ${dateMonthsFromNow(6)}.",
                ),
            )
        }
    }
}
