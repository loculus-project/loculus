package org.pathoplexus.backend.controller

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.pathoplexus.backend.api.Group
import org.pathoplexus.backend.api.GroupDetails
import org.pathoplexus.backend.service.groupmanagement.GroupManagementDatabaseService
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@SecurityRequirement(name = "bearerAuth")
class GroupManagementController(
    private val groupManagementDatabaseService: GroupManagementDatabaseService,
) {

    @Operation(description = "Create a new Group. The user creating the group will be added to the group.")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PostMapping("/groups/{newGroupName}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun createNewGroup(
        @UsernameFromJwt username: String,
        @Parameter(
            description = "The name of the newly created group",
        ) @PathVariable newGroupName: String,
    ) = groupManagementDatabaseService.createNewGroup(newGroupName, username)

    @Operation(description = "Get details of a group that the user is a member of.")
    @ResponseStatus(HttpStatus.OK)
    @GetMapping("/groups/{detailsOfGroupName}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getUsersOfGroup(@UsernameFromJwt username: String, @PathVariable detailsOfGroupName: String): GroupDetails {
        return groupManagementDatabaseService.getDetailsOfGroup(detailsOfGroupName, username)
    }

    @Operation(description = "Get all groups the user is a member of.")
    @ResponseStatus(HttpStatus.OK)
    @GetMapping("/user/groups", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getGroupsOfUser(@UsernameFromJwt username: String): List<Group> {
        return groupManagementDatabaseService.getGroupsOfUser(username)
    }

    @Operation(description = "Get a list of all groups.")
    @ResponseStatus(HttpStatus.OK)
    @GetMapping("/groups", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getAllGroups(): List<Group> {
        return groupManagementDatabaseService.getAllGroups()
    }

    @Operation(description = "Add user to a group.")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PostMapping("/groups/{groupName}/users/{usernameToAdd}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun addUserToGroup(
        @UsernameFromJwt groupMember: String,
        @Parameter(
            description = "The group name the user should be added to.",
        ) @PathVariable groupName: String,
        @Parameter(
            description = "The user name that should be added to the group.",
        ) @PathVariable usernameToAdd: String,
    ) = groupManagementDatabaseService.addUserToGroup(groupMember, groupName, usernameToAdd)

    @Operation(description = "Remove user from a group.")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @DeleteMapping("/groups/{groupName}/users/{usernameToRemove}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun removeUserFromGroup(
        @UsernameFromJwt groupMember: String,
        @Parameter(
            description = "The group name the user should be removed from.",
        ) @PathVariable groupName: String,
        @Parameter(
            description = "The user name that should be removed from the group.",
        ) @PathVariable usernameToRemove: String,
    ) = groupManagementDatabaseService.removeUserFromGroup(groupMember, groupName, usernameToRemove)
}
