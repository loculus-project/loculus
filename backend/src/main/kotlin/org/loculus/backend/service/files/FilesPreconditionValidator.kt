package org.loculus.backend.service.files

import org.loculus.backend.api.ExternalFile
import org.loculus.backend.auth.AuthenticatedUser
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.controller.BadRequestException
import org.loculus.backend.service.groupmanagement.GroupManagementPreconditionValidator
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.net.URI

@Component
class FilesPreconditionValidator(
    private val groupManagementPreconditionValidator: GroupManagementPreconditionValidator,
    private val backendConfig: BackendConfig,
) {
    fun validateNumberFiles(numberFiles: Int) {
        if (numberFiles < 1) {
            throw BadRequestException("Number of files must be at least 1")
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

    fun validateExternalFiles(externalFiles: List<ExternalFile>) {
        val allowedPrefixes = backendConfig.fileSharing.externalFileUrlPrefixes
        if (allowedPrefixes.isEmpty()) {
            throw BadRequestException("Linking external files is not enabled on this instance")
        }
        if (externalFiles.isEmpty()) {
            throw BadRequestException("At least one external file must be provided")
        }
        externalFiles.forEach { externalFile ->
            val url = externalFile.url
            // Normalizing prevents escaping an allowed prefix with path segments like `/../`
            val normalizedUrl = runCatching { URI(url).normalize().toString() }.getOrNull()
            if (normalizedUrl != url || allowedPrefixes.none { url.startsWith(it) }) {
                throw BadRequestException(
                    "External file URL '$url' is not allowed. URLs must be normalized and start with one of: " +
                        allowedPrefixes.joinToString(),
                )
            }
            if (externalFile.size != null && externalFile.size < 0) {
                throw BadRequestException("External file size must not be negative, got ${externalFile.size} for $url")
            }
        }
    }
}
