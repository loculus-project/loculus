package org.loculus.backend.new.api.v2.groups

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.auth.HiddenParam
import org.loculus.backend.auth.User
import org.loculus.backend.service.groupmanagement.GroupManagementDatabaseService
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.net.URI

@RestController
@RequestMapping("/v2")
@SecurityRequirement(name = "bearerAuth")
class GroupController(private val groupManagementDatabaseService: GroupManagementDatabaseService) {

    @Operation(description = "Get a list of groups, ordered by id. Supports filtering by name, ignoring case.")
    @ResponseStatus(HttpStatus.OK)
    @GetMapping("/groups", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getGroups(@RequestParam(required = false) name: String?): List<GroupResponse> =
        groupManagementDatabaseService.getGroups(name)
            .sortedBy { it.groupId }
            .map { it.toResponse() }

    @Operation(description = "Create a new group. The user creating the group will be added to the group.")
    @PostMapping("/groups", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun createGroup(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(description = "Information about the newly created group.")
        @RequestBody
        group: GroupRequest,
    ): ResponseEntity<GroupResponse> {
        val createdGroup = groupManagementDatabaseService.createNewGroup(group.fromRequest(), authenticatedUser)
        return ResponseEntity
            .created(URI.create("/v2/groups/${createdGroup.groupId}"))
            .body(createdGroup.toResponse())
    }

    @Operation(description = "Get a group. The contact email is redacted when not authenticated.")
    @ResponseStatus(HttpStatus.OK)
    @GetMapping("/groups/{groupId}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getGroup(
        @HiddenParam user: User,
        @Parameter(description = "The id of the group.") @PathVariable groupId: Int,
    ): GroupResponse = groupManagementDatabaseService.getDetailsOfGroup(groupId, user).group.toResponse()

    @Operation(description = "Edit a group. Only members of the group can edit it. The updated group is returned.")
    @ResponseStatus(HttpStatus.OK)
    @PutMapping("/groups/{groupId}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun updateGroup(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(description = "The id of the group to edit.") @PathVariable groupId: Int,
        @Parameter(description = "Updated group properties.")
        @RequestBody
        group: GroupRequest,
    ): GroupResponse =
        groupManagementDatabaseService.updateGroup(groupId, group.fromRequest(), authenticatedUser).toResponse()

    @Operation(description = "Get the members of a group.")
    @ResponseStatus(HttpStatus.OK)
    @GetMapping("/groups/{groupId}/members", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getMembers(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(description = "The id of the group.") @PathVariable groupId: Int,
    ): List<GroupMemberResponse> = groupManagementDatabaseService.getDetailsOfGroup(groupId, authenticatedUser)
        .users
        .orEmpty()
        .map { it.toResponse() }

    @Operation(description = "Add a user to a group.")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PutMapping("/groups/{groupId}/members/{username}")
    fun addMember(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(description = "The id of the group the user should be added to.") @PathVariable groupId: Int,
        @Parameter(description = "The username that should be added to the group.") @PathVariable username: String,
    ) = groupManagementDatabaseService.addUserToGroup(authenticatedUser, groupId, username)

    @Operation(description = "Remove a user from a group.")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @DeleteMapping("/groups/{groupId}/members/{username}")
    fun removeMember(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(description = "The id of the group the user should be removed from.") @PathVariable groupId: Int,
        @Parameter(description = "The username that should be removed from the group.") @PathVariable username: String,
    ) = groupManagementDatabaseService.removeUserFromGroup(authenticatedUser, groupId, username)

    @Operation(description = "Get all groups the user is a member of, ordered by id.")
    @ResponseStatus(HttpStatus.OK)
    @GetMapping("/me/groups", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getMyGroups(@HiddenParam authenticatedUser: AuthenticatedUser): List<GroupResponse> =
        groupManagementDatabaseService.getGroupsOfUser(authenticatedUser)
            .sortedBy { it.groupId }
            .map { it.toResponse() }
}
