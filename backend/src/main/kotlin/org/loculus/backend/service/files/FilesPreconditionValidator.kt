package org.loculus.backend.service.files

import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.service.groupmanagement.GroupManagementPreconditionValidator
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class FilesPreconditionValidator(
    private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
) {
    /**
     * Users who can modify the group and the preprocessing pipeline can
     * upload files for a group.
     */
    @Transactional(readOnly = true)
    fun validateUserIsAllowedToUploadFileForGroup(groupId: Int, authenticatedUser: AuthenticatedUser) {
        groupManagementPreconditionValidator.validateGroupExists(groupId)
        if (authenticatedUser.isPreprocessingPipeline) {
            return
        }
        groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroup(groupId, authenticatedUser)
    }
}
