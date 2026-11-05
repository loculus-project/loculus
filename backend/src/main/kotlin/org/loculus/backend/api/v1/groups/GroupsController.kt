package org.loculus.backend.api.v1.groups

import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.servlet.http.HttpServletResponse
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.auth.HiddenParam
import org.loculus.backend.auth.User
import org.loculus.backend.service.groupmanagement.GroupManagementDatabaseService
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
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

// Common status code descriptions shared across groups endpoints
private object StatusDescriptions {
    const val UNAUTHORIZED = "No bearer token was sent, or the bearer token is invalid or expired."
    const val TOKEN_INVALID_EXPIRED = "The bearer token is invalid or expired."
    const val UNSUPPORTED_MEDIA_TYPE = "The `Content-Type` header is missing or is not a JSON type."
    const val READ_ONLY = "The instance is in read-only mode."
    const val UNPROCESSABLE_REQUEST_BODY_FIELD = "A field in the request body fails validation."
    const val USER_NOT_IN_GROUP = "The requesting user is not a member of the group."
    const val GROUP_NOT_FOUND = "The group could not be found."
    const val INVALID_GROUP_ID = "The group ID is not an integer."
}
private const val GROUP_ID_DESCRIPTION = "The ID of the group."

@Tag(name = "Groups", description = "Create, update, get and list groups, and add and remove group users.")
@RestController
@RequestMapping("/v1")
@SecurityRequirement(name = "bearerAuth")
class GroupsController(private val groupManagementDatabaseService: GroupManagementDatabaseService) {

    @Operation(
        summary = "Create a group",
        description = "Create a new group. The user creating the group is added to it as a member.",
    )
    @ApiResponse(
        responseCode = "201",
        description =
        "The group was created. Returns the details of the created group, with a `Location` header giving its path.",
    )
    @ApiResponse(
        responseCode = "400",
        description = "The request body is missing, is not valid JSON, or doesn't match the expected format.",
    )
    @ApiResponse(responseCode = "401", description = StatusDescriptions.UNAUTHORIZED)
    @ApiResponse(responseCode = "415", description = StatusDescriptions.UNSUPPORTED_MEDIA_TYPE)
    @ApiResponse(responseCode = "422", description = StatusDescriptions.UNPROCESSABLE_REQUEST_BODY_FIELD)
    @ApiResponse(responseCode = "503", description = StatusDescriptions.READ_ONLY)
    @ResponseStatus(HttpStatus.CREATED)
    @PostMapping("/groups", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun createGroup(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(description = "Details of the group being created.")
        @RequestBody
        group: V1NewGroup,
        response: HttpServletResponse,
    ): V1Group {
        val createdGroup = groupManagementDatabaseService.createGroup(group.toServiceNewGroup(), authenticatedUser)
        val location = ServletUriComponentsBuilder.fromCurrentRequest()
            .path("/{groupId}")
            .buildAndExpand(createdGroup.groupId)
            .toUri().rawPath
        response.setHeader(HttpHeaders.LOCATION, location)
        return V1Group.from(createdGroup)
    }

    @Operation(
        summary = "Update a group",
        description = "Update the details of a group. The user updating the group must be a member of the group.",
    )
    @ApiResponse(
        responseCode = "200",
        description = "The group was updated. Returns the details of the updated group.",
    )
    @ApiResponse(
        responseCode = "400",
        description =
        "The group ID is not an integer, or the request body is missing, is not valid JSON, or doesn't match the expected format.",
    )
    @ApiResponse(responseCode = "401", description = StatusDescriptions.UNAUTHORIZED)
    @ApiResponse(responseCode = "403", description = StatusDescriptions.USER_NOT_IN_GROUP)
    @ApiResponse(responseCode = "404", description = StatusDescriptions.GROUP_NOT_FOUND)
    @ApiResponse(responseCode = "415", description = StatusDescriptions.UNSUPPORTED_MEDIA_TYPE)
    @ApiResponse(responseCode = "422", description = StatusDescriptions.UNPROCESSABLE_REQUEST_BODY_FIELD)
    @ApiResponse(responseCode = "503", description = StatusDescriptions.READ_ONLY)
    @ResponseStatus(HttpStatus.OK)
    @PutMapping("/groups/{groupId}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun updateGroup(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(
            description = GROUP_ID_DESCRIPTION,
        ) @PathVariable groupId: Int,
        @Parameter(description = "Details of the group being updated.")
        @RequestBody
        group: V1NewGroup,
    ): V1Group = V1Group.from(
        groupManagementDatabaseService.updateGroup(groupId, group.toServiceNewGroup(), authenticatedUser),
    )

    @Operation(
        summary = "Get the details of a group",
        description = "Get the details of a group. Contact information is redacted when not authenticated.",
    )
    @ApiResponse(responseCode = "200", description = "Returns the details of the requested group.")
    @ApiResponse(responseCode = "400", description = StatusDescriptions.INVALID_GROUP_ID)
    @ApiResponse(responseCode = "401", description = StatusDescriptions.TOKEN_INVALID_EXPIRED)
    @ApiResponse(responseCode = "404", description = StatusDescriptions.GROUP_NOT_FOUND)
    @ResponseStatus(HttpStatus.OK)
    @GetMapping("/groups/{groupId}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getGroupDetails(
        @HiddenParam user: User,
        @Parameter(
            description = GROUP_ID_DESCRIPTION,
        ) @PathVariable groupId: Int,
    ): V1Group = V1Group.from(groupManagementDatabaseService.getGroupDetails(groupId, user))

    @Operation(summary = "List the users of a group", description = "List the users of a group.")
    @ApiResponse(responseCode = "200", description = "Returns the users of the requested group.")
    @ApiResponse(responseCode = "400", description = StatusDescriptions.INVALID_GROUP_ID)
    @ApiResponse(responseCode = "401", description = StatusDescriptions.UNAUTHORIZED)
    @ApiResponse(responseCode = "404", description = StatusDescriptions.GROUP_NOT_FOUND)
    @ResponseStatus(HttpStatus.OK)
    @GetMapping("/groups/{groupId}/users", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getGroupUsers(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(
            description = GROUP_ID_DESCRIPTION,
        ) @PathVariable groupId: Int,
    ): List<V1GroupUser> =
        groupManagementDatabaseService.getGroupUsers(groupId, authenticatedUser).map(V1GroupUser::from)

    @Operation(summary = "List the requesting user's groups", description = "List the groups of the requesting user.")
    @ApiResponse(responseCode = "200", description = "Returns the groups of the requesting user.")
    @ApiResponse(responseCode = "401", description = StatusDescriptions.UNAUTHORIZED)
    @ResponseStatus(HttpStatus.OK)
    @GetMapping("/me/groups", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getUserGroups(@HiddenParam authenticatedUser: AuthenticatedUser): List<V1Group> =
        groupManagementDatabaseService.getGroupsOfUser(authenticatedUser).map(V1Group::from)

    @Operation(summary = "List groups", description = "List groups, optionally filtered by group name.")
    @ApiResponse(responseCode = "200", description = "Returns the list of groups.")
    @ApiResponse(responseCode = "401", description = StatusDescriptions.UNAUTHORIZED)
    @ResponseStatus(HttpStatus.OK)
    @GetMapping("/groups", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun getGroups(
        @Parameter(description = "Only return groups that match the given name, case insensitively.")
        @RequestParam(required = false)
        name: String?,
    ): List<V1Group> = groupManagementDatabaseService.getGroups(name).map(V1Group::from)

    @Operation(summary = "Add a user to a group", description = "Add a user to a group.")
    @ApiResponse(responseCode = "204", description = "The user was added to the group.")
    @ApiResponse(responseCode = "400", description = StatusDescriptions.INVALID_GROUP_ID)
    @ApiResponse(responseCode = "401", description = StatusDescriptions.UNAUTHORIZED)
    @ApiResponse(responseCode = "403", description = StatusDescriptions.USER_NOT_IN_GROUP)
    @ApiResponse(responseCode = "404", description = "The group or the user to add could not be found.")
    @ApiResponse(responseCode = "409", description = "The user is already a member of the group.")
    @ApiResponse(responseCode = "503", description = StatusDescriptions.READ_ONLY)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PutMapping("/groups/{groupId}/users/{username}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun addUserToGroup(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(
            description = GROUP_ID_DESCRIPTION,
        ) @PathVariable groupId: Int,
        @Parameter(
            description = "The username of the user to add.",
        ) @PathVariable username: String,
    ) = groupManagementDatabaseService.addUserToGroup(authenticatedUser, groupId, username)

    @Operation(summary = "Remove a user from a group", description = "Remove a user from a group.")
    @ApiResponse(responseCode = "204", description = "The user is no longer a member of the group.")
    @ApiResponse(responseCode = "400", description = StatusDescriptions.INVALID_GROUP_ID)
    @ApiResponse(responseCode = "401", description = StatusDescriptions.UNAUTHORIZED)
    @ApiResponse(responseCode = "403", description = StatusDescriptions.USER_NOT_IN_GROUP)
    @ApiResponse(responseCode = "404", description = StatusDescriptions.GROUP_NOT_FOUND)
    @ApiResponse(responseCode = "503", description = StatusDescriptions.READ_ONLY)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @DeleteMapping("/groups/{groupId}/users/{username}", produces = [MediaType.APPLICATION_JSON_VALUE])
    fun removeUserFromGroup(
        @HiddenParam authenticatedUser: AuthenticatedUser,
        @Parameter(
            description = GROUP_ID_DESCRIPTION,
        ) @PathVariable groupId: Int,
        @Parameter(
            description = "The username of the user to remove.",
        ) @PathVariable username: String,
    ) = groupManagementDatabaseService.removeUserFromGroup(authenticatedUser, groupId, username)
}
