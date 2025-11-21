package org.loculus.backend.service.submission

import org.loculus.backend.api.FileCategory
import org.loculus.backend.api.FileCategoryFilesMap
import org.loculus.backend.api.Organism
import org.loculus.backend.api.SubmissionIdFilesMap
import org.loculus.backend.api.categories
import org.loculus.backend.api.fileIds
import org.loculus.backend.api.getDuplicateFileNames
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.service.files.FileId
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.files.S3Service
import org.springframework.stereotype.Component

@Component
class FileMappingPreconditionValidator(
    private val backendConfig: BackendConfig,
    private val s3Service: S3Service,
    private val filesDatabaseService: FilesDatabaseService,
) {
    fun validateFilenamesAreUnique(fileCategoriesFilesMap: FileCategoryFilesMap?): FileMappingPreconditionValidator {
        if (fileCategoriesFilesMap == null) return this
        fileCategoriesFilesMap.categories.forEach { category: FileCategory ->
            val duplicateFileNames = fileCategoriesFilesMap.getDuplicateFileNames(category)
            if (duplicateFileNames.isNotEmpty()) {
                throw UnprocessableEntityException(
                    "The files in category $category contain duplicate file names: ${duplicateFileNames.joinToString()}",
                )
            }
        }
        return this
    }

    /**
     * Given a [FileCategoryFilesMap], check that all categories that are used in it, are also
     * defined in the config.submissionDataTypes.files.categories. This is to check _submission_ file maps.
     */
    fun validateCategoriesMatchSubmissionSchema(
        fileCategoriesFilesMap: FileCategoryFilesMap?,
        organism: Organism,
    ): FileMappingPreconditionValidator {
        if (fileCategoriesFilesMap == null) return this
        val allowedCategories = backendConfig
            .getInstanceConfig(organism).schema.submissionDataTypes.files.categories
        return validateCategoriesMatchSchema(fileCategoriesFilesMap, allowedCategories, organism, "submission")
    }

    /**
     * Given a [FileCategoryFilesMap], check that all categories that are used in it, are also
     * defined in the config.schema.files. This is to check _output_ file maps.
     */
    fun validateCategoriesMatchOutputSchema(
        fileCategoriesFilesMap: FileCategoryFilesMap?,
        organism: Organism,
    ): FileMappingPreconditionValidator {
        if (fileCategoriesFilesMap == null) return this
        val allowedCategories = backendConfig.getInstanceConfig(organism).schema.files
        return validateCategoriesMatchSchema(fileCategoriesFilesMap, allowedCategories, organism, "output")
    }

    fun validateMultipartUploads(fileIds: Set<FileId>): FileMappingPreconditionValidator {
        val uncompleted = filesDatabaseService.getUncompletedMultipartUploadIds(fileIds)
        if (uncompleted.isNotEmpty()) {
            throw UnprocessableEntityException(
                "The following multipart uploads have not been completed: " + uncompleted.joinToString(),
            )
        }
        return this
    }

    fun validateFileIdsExist(fileIds: Set<FileId>): FileMappingPreconditionValidator {
        val nonExistentFileIds = filesDatabaseService.getNonExistentFileIds(fileIds)
        if (nonExistentFileIds.isNotEmpty()) {
            throw UnprocessableEntityException(
                "The following file IDs do not exist: " + nonExistentFileIds.joinToString(),
            )
        }
        return this
    }

    fun validateFilesUploadedNotJustRequested(fileIds: Set<FileId>): FileMappingPreconditionValidator {
        val uncheckedFileIds = filesDatabaseService.getUncheckedFileIds(fileIds)
        val fileIdsWithoutFile = uncheckedFileIds.mapNotNull { fileId ->
            val fileSize = s3Service.getFileSize(fileId)
            if (fileSize == null) {
                fileId
            } else {
                filesDatabaseService.setFileSize(fileId, fileSize)
                null
            }
        }
        if (fileIdsWithoutFile.isNotEmpty()) {
            throw UnprocessableEntityException("No file uploaded for file IDs: ${fileIdsWithoutFile.joinToString()}")
        }
        return this
    }

    /**
     1. Validate that the fileIds exist (have been requested for upload)
     2. Check that a file has been uploaded for each fileId by checking S3 for its size
     */
    fun validateFilesExist(fileIds: Set<FileId>): FileMappingPreconditionValidator {
        validateFileIdsExist(fileIds)
        validateFilesUploadedNotJustRequested(fileIds)
        return this
    }

    private fun validateCategoriesMatchSchema(
        fileCategoriesFilesMap: FileCategoryFilesMap,
        allowedFileCategories: List<org.loculus.backend.config.FileCategory>,
        organism: Organism,
        categoriesType: String,
    ): FileMappingPreconditionValidator {
        val allowedCategories = allowedFileCategories.map { it.name }.toSet()

        fileCategoriesFilesMap.categories.forEach { category: FileCategory ->
            if (!allowedCategories.contains(category)) {
                throw UnprocessableEntityException(
                    "The category $category is not part of the configured $categoriesType categories for " +
                        "${organism.name}. Allowed categories are: ${allowedCategories.joinToString(", ")}.",
                )
            }
        }
        return this
    }
}

@Component
class SubmissionIdFilesMappingPreconditionValidator(
    private val fileMappingValidator: FileMappingPreconditionValidator,
) {
    fun validateFilenamesAreUnique(
        submissionIdFilesMap: SubmissionIdFilesMap?,
    ): SubmissionIdFilesMappingPreconditionValidator {
        submissionIdFilesMap?.values?.forEach {
            fileMappingValidator.validateFilenamesAreUnique(it)
        }
        return this
    }

    fun validateCategoriesMatchSchema(
        submissionIdFilesMap: SubmissionIdFilesMap?,
        organism: Organism,
    ): SubmissionIdFilesMappingPreconditionValidator {
        submissionIdFilesMap?.values?.forEach {
            fileMappingValidator.validateCategoriesMatchSubmissionSchema(it, organism)
        }
        return this
    }

    /**
     * For files that have been uploaded through the multipart upload protocol, this validates that the uploads
     * have been completed.
     */
    fun validateMultipartUploads(
        submissionIdFilesMap: SubmissionIdFilesMap?,
    ): SubmissionIdFilesMappingPreconditionValidator {
        submissionIdFilesMap?.values?.forEach {
            fileMappingValidator.validateMultipartUploads(it.fileIds)
        }
        return this
    }

    fun validateFilesExist(submissionIdFilesMap: SubmissionIdFilesMap?): SubmissionIdFilesMappingPreconditionValidator {
        submissionIdFilesMap?.values?.forEach {
            fileMappingValidator.validateFilesExist(it.fileIds)
        }
        return this
    }
}
