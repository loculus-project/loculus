package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.loculus.backend.api.ReviewCount
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.auth.HiddenParam
import org.loculus.backend.service.submission.SubmissionDatabaseService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/my")
@SecurityRequirement(name = "bearerAuth")
class NotificationController(private val submissionDatabaseService: SubmissionDatabaseService) {
    @Operation(
        summary = "Get the number of unreleased sequence entries awaiting review, per organism and group, " +
            "across all groups the authenticated user belongs to. Powers the notification bell.",
    )
    @GetMapping("/review-counts")
    fun getReviewCounts(@HiddenParam authenticatedUser: AuthenticatedUser): List<ReviewCount> =
        submissionDatabaseService.getReviewCounts(authenticatedUser)
}
