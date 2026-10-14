package org.loculus.backend.v2.groups

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.tags.Tag
import org.loculus.backend.api.Group
import org.loculus.backend.api.NewGroup
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.auth.HiddenParam
import org.loculus.backend.auth.User
import org.loculus.backend.service.groupmanagement.GroupManagementDatabaseService
import org.loculus.backend.v2.Authenticated
import org.loculus.backend.v2.Public
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
import org.springframework.web.servlet.support.ServletUriComponentsBuilder
import org.loculus.backend.api.User as GroupMember

@RestController
@RequestMapping("/v2", produces = [MediaType.APPLICATION_JSON_VALUE])
@Tag(name = "v2: groups")
class GroupController(private val groupService: GroupManagementDatabaseService) {

    @Operation(description = "List groups, optionally filtered by name (case-insensitive exact match).")
    @Authenticated
    @GetMapping("/groups")
    fun getGroups(
        @Parameter(description = "Only return groups with this name.") @RequestParam(required = false) name: String?,
    ): List<Group> = groupService.getGroups(name)

    @Operation(description = "Create a group. The creating user becomes its first member.")
    @Authenticated
    @PostMapping("/groups", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun createGroup(@HiddenParam user: AuthenticatedUser, @RequestBody group: NewGroup): ResponseEntity<Group> {
        val created = groupService.createNewGroup(group, user)
        val location = ServletUriComponentsBuilder.fromCurrentRequest()
            .path("/{groupId}")
            .buildAndExpand(created.groupId)
            .toUri()
        return ResponseEntity.created(location).body(created)
    }

    @Operation(description = "Get a group. The contact email is omitted when not authenticated.")
    @Public
    @GetMapping("/groups/{groupId}")
    fun getGroup(@HiddenParam user: User, @PathVariable groupId: Int): Group = groupService.getGroup(groupId, user)

    @Operation(description = "Replace the properties of a group. Only members of the group and superusers may do this.")
    @Authenticated
    @PutMapping("/groups/{groupId}", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun updateGroup(
        @HiddenParam user: AuthenticatedUser,
        @PathVariable groupId: Int,
        @RequestBody group: NewGroup,
    ): Group = groupService.updateGroup(groupId, group, user)

    @Operation(description = "List the members of a group.")
    @Authenticated
    @GetMapping("/groups/{groupId}/members")
    fun getMembers(@PathVariable groupId: Int): List<GroupMember> = groupService.getMembers(groupId)

    @Operation(description = "Add a user to a group. Only members of the group and superusers may do this.")
    @Authenticated
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PutMapping("/groups/{groupId}/members/{username}")
    fun addMember(@HiddenParam user: AuthenticatedUser, @PathVariable groupId: Int, @PathVariable username: String) =
        groupService.addUserToGroup(user, groupId, username)

    @Operation(description = "Remove a user from a group. Only members of the group and superusers may do this.")
    @Authenticated
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @DeleteMapping("/groups/{groupId}/members/{username}")
    fun removeMember(@HiddenParam user: AuthenticatedUser, @PathVariable groupId: Int, @PathVariable username: String) =
        groupService.removeUserFromGroup(user, groupId, username)

    @Operation(description = "List the groups the current user is a member of. Superusers get all groups.")
    @Authenticated
    @GetMapping("/me/groups")
    fun getMyGroups(@HiddenParam user: AuthenticatedUser): List<Group> = groupService.getGroupsOfUser(user)
}
