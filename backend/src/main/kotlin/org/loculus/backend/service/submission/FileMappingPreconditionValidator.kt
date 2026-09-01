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

private val RESERVED_DEVICE_NAME_REGEX = Regex("CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]", RegexOption.IGNORE_CASE)
private val STRICT_FILENAME_REGEX = Regex("[a-zA-Z0-9_.-]+")

@Component
class FileMappingPreconditionValidator(
    private val backendConfig: BackendConfig,
    private val s3Service: S3Service,
    private val filesDatabaseService: FilesDatabaseService,
) {
    fun validateFilenameCharacters(fileCategoriesFilesMap: FileCategoryFilesMap?): FileMappingPreconditionValidator {
        if (fileCategoriesFilesMap == null) {
            return this
        }

        val validateFilename = if (backendConfig.fileSharing.disableStrictFilenameValidation) {
            ::baseValidateFilename
        } else {
            ::strictValidateFilename
        }

        fileCategoriesFilesMap.forEach { (category, files) ->
            files.forEach { file ->
                validateFilename(file.name, category)
            }
        }
        return this
    }

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

    // TODO #5503: Write tests for this
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
        val markedForDeletion = filesDatabaseService.filterMarkedForDeletionFileIds(fileIds)
        if (markedForDeletion.isNotEmpty()) {
            throw UnprocessableEntityException(
                "The following file IDs are no longer valid because they have expired: ${markedForDeletion.joinToString()}",
            )
        }
        return this
    }

    fun validateFilesUploaded(fileIds: Set<FileId>): FileMappingPreconditionValidator {
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
     * 1. Validate that the fileIds exist (have been requested for upload)
     * 2. Check that a file has been uploaded for each fileId by checking S3 for its size
     */
    fun validateFilesExist(fileIds: Set<FileId>): FileMappingPreconditionValidator {
        validateFileIdsExist(fileIds)
        validateFilesUploaded(fileIds)
        return this
    }

    /**
     * This validates that the filename is not in violation with our base restrictions, ensuring that the filenames
     * are likely compatible with major operating systems.
     *
     * IMPORTANT: Not having any additional filename restrictions may lead to unexpected bugs or issues.
     *
     * Base restrictions:
     * - ASCII control characters: NUL, SOH, etc. (code 0-31)
     * - /\:*"?<>| characters: forbidden in NTFS (for Windows) and FAT32
     * - ;%# characters: forbidden due to web encoding issues (see #7056)
     * - More than 255 characters: ext4 and NTFS only allow 255 bytes
     * - Windows reserved device names: CON, PRN, AUX, NUL, COM1-COM9, LPT1-LPT9, with or without an extension
     * - Single and double period names: forbidden to prevent path normalisation issues
     * - Whitespace characters
     *
     * References:
     * - https://en.wikipedia.org/wiki/Comparison_of_file_systems#Limits
     * - https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file
     */
    private fun baseValidateFilename(filename: String, category: FileCategory) {
        if (filename.isEmpty()) {
            throw UnprocessableEntityException(
                "Invalid filename '$filename' in category '$category': Filenames may not be empty",
            )
        }
        if (filename.length > 255) {
            throw UnprocessableEntityException(
                "Invalid filename '$filename' in category '$category': Filenames may not exceed 255 characters",
            )
        }
        if (filename.any { it in "<>:\"/\\|?*;%#" }) {
            throw UnprocessableEntityException(
                "Invalid filename '$filename' in category '$category': Filenames may not contain " +
                    "forbidden characters (< > : \" / \\ | ? * ; % #).",
            )
        }
        if (filename.any { it.code in 0..31 }) {
            throw UnprocessableEntityException(
                "Invalid filename '$filename' in category '$category': Filenames may not contain " +
                    "ASCII control characters 0-31.",
            )
        }
        if (RESERVED_DEVICE_NAME_REGEX.matches(filename.substringBefore('.'))) {
            throw UnprocessableEntityException(
                "Invalid filename '$filename' in category '$category': Filenames may not use Windows " +
                    "reserved device names (CON, PRN, AUX, NUL, COM1-COM9, LPT1-LPT9).",
            )
        }
        if (filename == "." || filename == "..") {
            throw UnprocessableEntityException(
                "Invalid filename '$filename' in category '$category': Filenames '.' and '..' are not accepted.",
            )
        }
        if (filename.any { it.isWhitespace() }) {
            throw UnprocessableEntityException(
                "Invalid filename '$filename' in category '$category': Filenames may not contain whitespace.",
            )
        }
    }

    /**
     * This validates filenames comply with our base restrictions, as well as ensuring names only include:
     * - Uppercase letters (A-Z)
     * - Lowercase letters (a-z)
     * - Numbers (0-9)
     * - Underscores (_)
     * - Hyphens (-)
     * - Periods (.)
     */
    private fun strictValidateFilename(filename: String, category: FileCategory) {
        baseValidateFilename(filename, category)

        if (!STRICT_FILENAME_REGEX.matches(filename)) {
            throw UnprocessableEntityException(
                "Invalid filename '$filename' in category '$category': Filenames must only contain " +
                    "alphanumeric characters, underscores, periods and hyphens.",
            )
        }
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
    fun validateFilenameCharacters(
        submissionIdFilesMap: SubmissionIdFilesMap?,
    ): SubmissionIdFilesMappingPreconditionValidator {
        submissionIdFilesMap?.values?.forEach {
            fileMappingValidator.validateFilenameCharacters(it)
        }
        return this
    }

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
    // TODO #5503: Write tests for this
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
