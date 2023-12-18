package org.pathoplexus.backend.controller.submission

import org.hamcrest.CoreMatchers.containsString
import org.hamcrest.CoreMatchers.`is`
import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.empty
import org.junit.jupiter.api.Test
import org.pathoplexus.backend.api.SequenceEntryVersionToEdit
import org.pathoplexus.backend.api.Status
import org.pathoplexus.backend.controller.DEFAULT_ORGANISM
import org.pathoplexus.backend.controller.OTHER_ORGANISM
import org.pathoplexus.backend.controller.assertStatusIs
import org.pathoplexus.backend.controller.expectNdjsonAndGetContent
import org.pathoplexus.backend.controller.expectUnauthorizedResponse
import org.pathoplexus.backend.controller.generateJwtFor
import org.pathoplexus.backend.controller.getAccessionVersions
import org.pathoplexus.backend.controller.submission.SubmitFiles.DefaultFiles.firstAccession
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.content
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@EndpointTest
class GetDataToEditEndpointTest(
    @Autowired val client: SubmissionControllerClient,
    @Autowired val convenienceClient: SubmissionConvenienceClient,
) {

    @Test
    fun `GIVEN invalid authorization token THEN returns 401 Unauthorized`() {
        expectUnauthorizedResponse {
            client.getSequenceEntryThatHasErrors(
                firstAccession,
                1,
                jwt = it,
            )
        }
        expectUnauthorizedResponse {
            client.getNumberOfSequenceEntriesThatHaveErrors(
                1,
                jwt = it,
            )
        }
    }

    @Test
    fun `GIVEN an entry has errors WHEN I extract the sequence data THEN I get all data to edit the entry`() {
        convenienceClient.prepareDefaultSequenceEntriesToInProcessing()

        convenienceClient.submitProcessedData(PreparedProcessedData.withErrors())

        convenienceClient.getSequenceEntryOfUser(accession = firstAccession, version = 1)
            .assertStatusIs(Status.HAS_ERRORS)

        val editedData = convenienceClient.getSequenceEntryThatHasErrors(
            accession = firstAccession,
            version = 1,
        )

        assertThat(editedData.accession, `is`(firstAccession))
        assertThat(editedData.version, `is`(1))
        assertThat(editedData.processedData, `is`(PreparedProcessedData.withErrors().data))
    }

    @Test
    fun `WHEN I query data for a non-existent accession THEN refuses request with not found`() {
        val nonExistentAccession = "999"

        client.getSequenceEntryThatHasErrors(nonExistentAccession, 1)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession version $nonExistentAccession.1 does not exist",
                ),
            )
    }

    @Test
    fun `WHEN I query data for wrong organism THEN refuses request with unprocessable entity`() {
        convenienceClient.prepareDataTo(Status.HAS_ERRORS, organism = DEFAULT_ORGANISM)

        client.getSequenceEntryThatHasErrors(firstAccession, 1, organism = DEFAULT_ORGANISM)
            .andExpect(status().isOk)
        client.getSequenceEntryThatHasErrors(firstAccession, 1, organism = OTHER_ORGANISM)
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(containsString("1.1 is for organism dummyOrganism")),
            )
            .andExpect(
                jsonPath("\$.detail").value(
                    containsString("requested data for organism otherOrganism"),
                ),
            )
    }

    @Test
    fun `WHEN I query data for a non-existent accession version THEN refuses request with not found`() {
        val nonExistentAccessionVersion = 999L

        convenienceClient.prepareDataTo(Status.HAS_ERRORS)

        client.getSequenceEntryThatHasErrors("1", nonExistentAccessionVersion)
            .andExpect(status().isNotFound)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession version 1.$nonExistentAccessionVersion does not exist",
                ),
            )
    }

    @Test
    fun `WHEN I query a sequence entry that has a wrong state THEN refuses request with unprocessable entity`() {
        convenienceClient.prepareDataTo(Status.IN_PROCESSING)

        client.getSequenceEntryThatHasErrors(
            accession = firstAccession,
            version = 1,
        )
            .andExpect(status().isUnprocessableEntity)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Accession version 1.1 is in not in state HAS_ERRORS or AWAITING_APPROVAL (was IN_PROCESSING)",
                ),
            )
    }

    @Test
    fun `WHEN I try to get data for a sequence entry that I do not own THEN refuses request with forbidden entity`() {
        convenienceClient.prepareDataTo(Status.HAS_ERRORS)

        val userNameThatDoesNotHavePermissionToQuery = "theOneWhoMustNotBeNamed"
        client.getSequenceEntryThatHasErrors(
            accession = firstAccession,
            version = 1,
            jwt = generateJwtFor(userNameThatDoesNotHavePermissionToQuery),
        )
            .andExpect(status().isForbidden)
            .andExpect(content().contentType(MediaType.APPLICATION_JSON_VALUE))
            .andExpect(
                jsonPath("\$.detail").value(
                    "Sequence entry 1.1 is not owned by user $userNameThatDoesNotHavePermissionToQuery",
                ),
            )
    }

    @Test
    fun `WHEN I try to get batch data for sequence entries to edit THEN I get the expected count back`() {
        convenienceClient.prepareDataTo(Status.HAS_ERRORS)

        val numberOfEditedSequenceEntries = client.getNumberOfSequenceEntriesThatHaveErrors(
            SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_NDJSON_VALUE))
            .expectNdjsonAndGetContent<SequenceEntryVersionToEdit>().size
        assertThat(numberOfEditedSequenceEntries, `is`(SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES))

        val userNameThatDoesNotHavePermissionToQuery = "theOneWhoMustNotBeNamed"
        val numberOfEditedSequenceEntryVersionsForAWrongUser = client.getNumberOfSequenceEntriesThatHaveErrors(
            SubmitFiles.DefaultFiles.NUMBER_OF_SEQUENCES,
            jwt = generateJwtFor(userNameThatDoesNotHavePermissionToQuery),
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_NDJSON_VALUE))
            .expectNdjsonAndGetContent<SequenceEntryVersionToEdit>().size
        assertThat(numberOfEditedSequenceEntryVersionsForAWrongUser, `is`(0))
    }

    @Test
    fun `GIVEN sequence entries for different organisms THEN only returns data for requested organism`() {
        val defaultOrganismData = convenienceClient.prepareDataTo(Status.HAS_ERRORS, organism = DEFAULT_ORGANISM)
        val otherOrganismData = convenienceClient.prepareDataTo(Status.HAS_ERRORS, organism = OTHER_ORGANISM)

        val sequencesToEdit = client.getNumberOfSequenceEntriesThatHaveErrors(
            defaultOrganismData.size + otherOrganismData.size,
            organism = OTHER_ORGANISM,
        )
            .andExpect(status().isOk)
            .andExpect(content().contentType(MediaType.APPLICATION_NDJSON_VALUE))
            .expectNdjsonAndGetContent<SequenceEntryVersionToEdit>()

        assertThat(
            sequencesToEdit.getAccessionVersions(),
            containsInAnyOrder(*otherOrganismData.getAccessionVersions().toTypedArray()),
        )
        assertThat(
            sequencesToEdit.getAccessionVersions().intersect(defaultOrganismData.getAccessionVersions().toSet()),
            `is`(empty()),
        )
    }

    @Test
    fun `WHEN I want to get more than allowed number of edited entries at once THEN returns Bad Request`() {
        client.getNumberOfSequenceEntriesThatHaveErrors(100_001)
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("\$.detail", containsString("You can extract at max 100000 sequence entries at once.")))
    }
}
