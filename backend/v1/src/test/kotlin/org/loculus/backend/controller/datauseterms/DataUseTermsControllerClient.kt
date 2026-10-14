package org.loculus.backend.controller.datauseterms

import com.fasterxml.jackson.databind.ObjectMapper
import org.loculus.backend.api.DataUseTerms
import org.loculus.backend.api.DataUseTermsChangeRequest
import org.loculus.backend.controller.jwtForDefaultUser
import org.loculus.backend.controller.withAuth
import org.loculus.backend.utils.Accession
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put

val DEFAULT_DATA_USE_CHANGE_REQUEST = DataUseTermsChangeRequest(
    accessions = listOf("1", "2"),
    newDataUseTerms = DataUseTerms.Open,
)

class DataUseTermsControllerClient(private val mockMvc: MockMvc, private val objectMapper: ObjectMapper) {
    fun changeDataUseTerms(
        newDataUseTerms: DataUseTermsChangeRequest,
        jwt: String? = jwtForDefaultUser,
    ): ResultActions = mockMvc.perform(
        put("/data-use-terms")
            .contentType(MediaType.APPLICATION_JSON_VALUE)
            .content(objectMapper.writeValueAsString(newDataUseTerms))
            .withAuth(jwt),
    )

    fun getDataUseTerms(accession: Accession): ResultActions = mockMvc.perform(
        get("/data-use-terms/$accession"),
    )
}
