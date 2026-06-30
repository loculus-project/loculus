package org.loculus.backend.controller.user

import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.ResultActions
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get

const val MOCK_USERNAME = "testuser"
const val MOCK_USER_EMAIL = "testuser@example.com"
const val MOCK_USER_FIRST_NAME = "Test"
const val MOCK_USER_LAST_NAME = "User"
const val MOCK_USER_UNIVERSITY = "Test University"

class UserControllerClient(private val mockMvc: MockMvc) {
    fun getUser(username: String): ResultActions = mockMvc.perform(
        get("/users/{username}", username),
    )
}
