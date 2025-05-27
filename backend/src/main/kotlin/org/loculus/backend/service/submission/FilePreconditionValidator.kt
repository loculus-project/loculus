package org.loculus.backend.service.submission

import org.loculus.backend.api.FileCategory
import org.loculus.backend.api.FileCategoryFilesMap
import org.loculus.backend.api.Organism
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.config.BackendConfig

class FilePreconditionValidator(
    private val backendConfig: BackendConfig
) {
    fun validateFilenamesAreUnique(fileCategoriesFilesMap: FileCategoryFilesMap?) {
        if (fileCategoriesFilesMap == null) return
        fileCategoriesFilesMap.categories().forEach { category: FileCategory ->
            val duplicateFileNames = fileCategoriesFilesMap.getDuplicateFileNames(category)
            if (duplicateFileNames.isNotEmpty()) {
                throw UnprocessableEntityException(
                    "The files in category $category contain duplicate file names: ${duplicateFileNames.joinToString()}"
                )
            }
        }
    }

    fun validateCategoriesMatchSchema(
        fileCategoriesFilesMap: FileCategoryFilesMap?,
        organism: Organism
    ) {
        if (fileCategoriesFilesMap == null) return
        val allowedCategories = backendConfig
            .getInstanceConfig(organism)
            .schema.submissionDataTypes.files.categories
            .map { it.name }

        fileCategoriesFilesMap.categories().forEach { category: FileCategory ->
            if (!allowedCategories.contains(category)) {
                throw UnprocessableEntityException(
                    "The category $category is not part of the configured categories for $organism."
                )
            }
        }
    }
}
