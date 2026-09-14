package org.loculus.backend.service.files

import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.controller.BadRequestException
import org.loculus.backend.service.groupmanagement.GroupManagementPreconditionValidator
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

@Component
class FilesPreconditionValidator(
    private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
) {
    fun validateNumberFiles(numberFiles: Int) {
        if (numberFiles < 1) {
            throw BadRequestException("Number of files must be at least 1")
        }
    }

    fun validateContentLength(contentLength: Long) {
        if (contentLength < 0) {
            throw BadRequestException("contentLength must not be negative")
        }
    }

    fun validatePartSizes(partSizes: List<Long>) {
        if (partSizes.isEmpty() || partSizes.size > 10000) {
            throw BadRequestException("The number of parts must be between 1 and 10000.")
        }
        if (partSizes.any { it < 0 }) {
            throw BadRequestException("partSizes must not contain negative values")
        }
    }

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
