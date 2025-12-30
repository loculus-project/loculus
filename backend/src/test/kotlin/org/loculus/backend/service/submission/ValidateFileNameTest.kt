package org.loculus.backend.service.submission

import io.mockk.mockk
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.loculus.backend.api.FileCategory
import org.loculus.backend.api.FileCategoryFilesMap
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.files.S3Service
import java.util.UUID

class ValidateFileNameTest {
    private val backendConfig: BackendConfig = mockk()
    private val s3Service: S3Service = mockk()
    private val filesDatabaseService: FilesDatabaseService = mockk()
    private val validator = FileMappingPreconditionValidator(backendConfig, s3Service, filesDatabaseService)

    private fun createFileMapping(category: FileCategory, filenames: List<String>): FileCategoryFilesMap {
        val files = filenames.map { FileIdAndName(UUID.randomUUID(), it) }
        return mapOf(category to files)
    }

    @Test
    fun `valid filenames should pass validation`() {
        val fileMapping = createFileMapping(
            "sequences",
            listOf(
                "file.txt",
                "my_file.fasta",
                "data-2024.csv",
                "results_final_v2.xlsx",
                "file123.json",
                "UPPERCASE.TXT",
            ),
        )
        validator.validateFilenameCharacters(fileMapping)
    }

    @Test
    fun `unicode filenames should pass validation`() {
        val fileMapping = createFileMapping(
            "sequences",
            listOf(
                "文件.txt",
                "データ.csv",
                "файл.json",
                "αρχείο.xml",
                "ملف.fasta",
            ),
        )
        validator.validateFilenameCharacters(fileMapping)
    }

    @Test
    fun `filenames with leading periods should pass validation`() {
        val fileMapping = createFileMapping("sequences", listOf(".gitignore", ".hidden_file.txt"))
        validator.validateFilenameCharacters(fileMapping)
    }

    @Test
    fun `empty filename should fail validation`() {
        val fileMapping = createFileMapping("sequences", listOf(""))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping)
        }
    }

    @Test
    fun `filename exceeding 255 characters should fail validation`() {
        val longFilename = "a".repeat(256) + ".txt"
        val fileMapping = createFileMapping("sequences", listOf(longFilename))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping)
        }
    }

    @Test
    fun `filename with less than sign should fail validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file<test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping)
        }
    }

    @Test
    fun `filename with greater than sign should fail validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file>test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping)
        }
    }

    @Test
    fun `filename with colon should fail validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file:test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping)
        }
    }

    @Test
    fun `filename with double quote should fail validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file\"test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping)
        }
    }

    @Test
    fun `filename with forward slash should fail validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file/test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping)
        }
    }

    @Test
    fun `filename with backslash should fail validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file\\test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping)
        }
    }

    @Test
    fun `filename with pipe should fail validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file|test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping)
        }
    }

    @Test
    fun `filename with question mark should fail validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file?.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping)
        }
    }

    @Test
    fun `filename with asterisk should fail validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file*.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping)
        }
    }

    @Test
    fun `filename with NUL should fail validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file\u0000test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping)
        }
    }

    @Test
    fun `filename with ASCII control character should fail validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file\u0001test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping)
        }
    }

    @Test
    fun `null file mapping should pass validation`() {
        validator.validateFilenameCharacters(null)
    }

    @Test
    fun `empty file mapping should pass validation`() {
        validator.validateFilenameCharacters(emptyMap())
    }

    @Test
    fun `multiple files with mixed valid and invalid names should fail validation`() {
        val fileMapping = createFileMapping(
            "sequences",
            listOf(
                "valid_file1.txt",
                "valid_file2.txt",
                "invalid|file.txt",
                "another_valid.txt",
            ),
        )
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping)
        }
    }
}
