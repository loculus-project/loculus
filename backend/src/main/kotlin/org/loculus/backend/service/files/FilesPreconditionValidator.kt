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
     * Only users that can modify the group, can upload files for it.
     * But the preprocessing pipeline can also upload files for a group.
     */
    @Transactional(readOnly = true)
    fun validateUserIsAllowedToUploadFileForGroup(groupId: Int, authenticatedUser: AuthenticatedUser) {
        if (authenticatedUser.isPreprocessingPipeline) {
            return
        }
        groupManagementPreconditionValidator.validateUserIsAllowedToModifyGroup(groupId, authenticatedUser)
    }
}
