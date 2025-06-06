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

    fun validateCategoriesMatchSchema(
        fileCategoriesFilesMap: FileCategoryFilesMap?,
        organism: Organism,
    ): FileMappingPreconditionValidator {
        if (fileCategoriesFilesMap == null) return this
        val allowedCategories = backendConfig
            .getInstanceConfig(organism)
            .schema.submissionDataTypes.files.categories
            .map { it.name }
            .toSet()

        fileCategoriesFilesMap.categories.forEach { category: FileCategory ->
            if (!allowedCategories.contains(category)) {
                throw UnprocessableEntityException(
                    "The category $category is not part of the configured categories for ${organism.name}.",
                )
            }
        }
        return this
    }

    fun validateFilesExist(fileIds: Set<FileId>): FileMappingPreconditionValidator {
        val uncheckedFileIds = filesDatabaseService.getUncheckedFileIds(fileIds)
        uncheckedFileIds.forEach { fileId ->
            val fileSize = s3Service.getFileSize(fileId)
                ?: throw UnprocessableEntityException("No file uploaded for file ID $fileId.")
            filesDatabaseService.setFileSize(fileId, fileSize)
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
            fileMappingValidator.validateCategoriesMatchSchema(it, organism)
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
