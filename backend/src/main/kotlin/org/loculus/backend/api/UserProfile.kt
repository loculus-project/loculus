package org.loculus.backend.api

import io.swagger.v3.oas.annotations.media.Schema

data class UserProfile(
    val username: String,
    val firstName: String,
    val lastName: String,
    val emailDomain: String,
    @Schema(
        description = "The university the user is affiliated with.",
        type = "string",
        example = "University of Example",
    )
    val university: String?,
)
