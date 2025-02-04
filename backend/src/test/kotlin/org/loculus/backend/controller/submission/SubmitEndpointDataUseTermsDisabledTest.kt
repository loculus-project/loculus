package org.loculus.backend.controller.submission

import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.config.BackendSpringProperty
import org.loculus.backend.controller.DATA_USE_TERMS_DISABLED_CONFIG
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.EndpointTest
import org.loculus.backend.controller.groupmanagement.GroupManagementControllerClient
import org.loculus.backend.controller.groupmanagement.andGetGroupId
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles
import org.loculus.backend.controller.submission.SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType.APPLICATION_JSON_VALUE
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest(
    properties = ["${BackendSpringProperty.BACKEND_CONFIG_PATH}=$DATA_USE_TERMS_DISABLED_CONFIG"],
)
class SubmitEndpointDataUseTermsDisabledTest(
    @Autowired val submissionControllerClient: SubmissionControllerClient,
    @Autowired val backendConfig: BackendConfig,
    @Autowired val groupManagementClient: GroupManagementControllerClient,
) {
    var groupId: Int = 0

    @BeforeEach
    fun prepareNewGroup() {
        groupId = groupManagementClient.createNewGroup().andGetGroupId()
    }

    @Test
    fun `config has been read and data use terms are configured to be off`() {
        assertThat(backendConfig.dataUseTerms.enabled, `is`(false))
    }

    @Test
    fun `GIVEN valid input multi segment data THEN returns mapping of provided custom ids to generated ids`() {
        submissionControllerClient.submitWithoutDataUseTerms(
            DefaultFiles.metadataFile,
            DefaultFiles.sequencesFile,
            organism = DEFAULT_ORGANISM,
            groupId = groupId,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(APPLICATION_JSON_VALUE))
            .andExpect(jsonPath("\$.length()").value(NUMBER_OF_SEQUENCES))
            .andExpect(jsonPath("\$[0].submissionId").value("custom0"))
            .andExpect(jsonPath("\$[0].accession", containsString(backendConfig.accessionPrefix)))
            .andExpect(jsonPath("\$[0].version").value(1))
    }
}
