package org.loculus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.loculus.backend.api.Group
import org.loculus.backend.api.GroupDetails
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.auth.HiddenParam
import org.loculus.backend.service.groupmanagement.GroupManagementDatabaseService
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@SecurityRequirement(name = "bearerAuth")
class GroupManagementController(
    private val groupManagementDatabaseService: GroupManagementDatabaseService,
) {

    @Operation(description = "Create a new Group. The user creating the group will be added to the group.")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PostMapping("/groups", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun createNewGroup(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(description = "Information about the newly created group")
        @RequestBody
        group: Group,
    ) = groupManagementDatabaseService.createNewGroup(group, authenticatedUser)

    @Operation(description = "Get details of a group.")
    @ResponseStatus(HttpStatus.OK)
    @GetMapping("/groups/{groupName}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getUsersOfGroup(
        @Parameter(
            description = "The name of the group to get details of.",
        ) @PathVariable groupName: String,
    ): GroupDetails {
        return groupManagementDatabaseService.getDetailsOfGroup(groupName)
    }

    @Operation(description = "Get all groups the user is a member of.")
    @ResponseStatus(HttpStatus.OK)
    @GetMapping("/user/groups", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getGroupsOfUser(@HiddenParam authenticatedUser: AuthenticatedUser): List<Group> {
        return groupManagementDatabaseService.getGroupsOfUser(authenticatedUser)
    }

    @Operation(description = "Get a list of all groups.")
    @ResponseStatus(HttpStatus.OK)
    @GetMapping("/groups", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getAllGroups(): List<Group> {
        return groupManagementDatabaseService.getAllGroups()
    }

    @Operation(description = "Add user to a group.")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PutMapping("/groups/{groupName}/users/{usernameToAdd}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun addUserToGroup(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(
            description = "The group name the user should be added to.",
        ) @PathVariable groupName: String,
        @Parameter(
            description = "The user name that should be added to the group.",
        ) @PathVariable usernameToAdd: String,
    ) = groupManagementDatabaseService.addUserToGroup(authenticatedUser, groupName, usernameToAdd)

    @Operation(description = "Remove user from a group.")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @DeleteMapping("/groups/{groupName}/users/{usernameToRemove}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun removeUserFromGroup(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(
            description = "The group name the user should be removed from.",
        ) @PathVariable groupName: String,
        @Parameter(
            description = "The user name that should be removed from the group.",
        ) @PathVariable usernameToRemove: String,
    ) = groupManagementDatabaseService.removeUserFromGroup(authenticatedUser, groupName, usernameToRemove)
}
