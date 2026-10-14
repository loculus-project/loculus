package org.loculus.api.groups

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.tags.Tag
import org.loculus.api.auth.AuthenticatedUser
import org.loculus.api.auth.HiddenParam
import org.loculus.api.auth.User
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

@RestController
@RequestMapping("/v2", produces = [MediaType.APPLICATION_JSON_VALUE])
@Tag(name = "Groups")
class GroupController(private val groupService: GroupService) {

    @Operation(description = "List groups, optionally filtered by name (case-insensitive exact match).")
    @GetMapping("/groups")
    fun getGroups(
        @Parameter(description = "Only return groups with this name.")
        @RequestParam(required = false)
        name: String?,
    ): List<Group> = groupService.getGroups(name)

    @Operation(description = "Create a group. The creating user becomes its first member.")
    @PostMapping("/groups", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun createGroup(@HiddenParam user: AuthenticatedUser, @RequestBody group: GroupInput): ResponseEntity<Group> {
        val created = groupService.createGroup(group, user)
        val location = ServletUriComponentsBuilder.fromCurrentRequest()
            .path("/{groupId}")
            .buildAndExpand(created.groupId)
            .toUri()
        return ResponseEntity.created(location).body(created)
    }

    @Operation(description = "Get a group. Public; the contact email is omitted when not authenticated.")
    @GetMapping("/groups/{groupId}")
    fun getGroup(@HiddenParam user: User, @PathVariable groupId: Int): Group = groupService.getGroup(groupId, user)

    @Operation(description = "Replace the properties of a group. Only members and superusers may do this.")
    @PutMapping("/groups/{groupId}", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun updateGroup(
        @HiddenParam user: AuthenticatedUser,
        @PathVariable groupId: Int,
        @RequestBody group: GroupInput,
    ): Group = groupService.updateGroup(groupId, group, user)

    @Operation(description = "List the members of a group.")
    @GetMapping("/groups/{groupId}/members")
    fun getMembers(@PathVariable groupId: Int): List<GroupMember> = groupService.getMembers(groupId)

    @Operation(description = "Add a user to a group. Only members and superusers may do this.")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PutMapping("/groups/{groupId}/members/{username}")
    fun addMember(@HiddenParam user: AuthenticatedUser, @PathVariable groupId: Int, @PathVariable username: String) =
        groupService.addMember(groupId, username, user)

    @Operation(description = "Remove a user from a group. Only members and superusers may do this.")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @DeleteMapping("/groups/{groupId}/members/{username}")
    fun removeMember(
        @HiddenParam user: AuthenticatedUser,
        @PathVariable groupId: Int,
        @PathVariable username: String,
    ) = groupService.removeMember(groupId, username, user)

    @Operation(description = "List the groups the current user is a member of. Superusers get all groups.")
    @GetMapping("/me/groups")
    fun getMyGroups(@HiddenParam user: AuthenticatedUser): List<Group> = groupService.getGroupsOfUser(user)
}
