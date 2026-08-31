package org.loculus.backend.service.submission

import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.loculus.backend.api.FileCategory
import org.loculus.backend.api.FileCategoryFilesMap
import org.loculus.backend.api.FileIdAndName
import org.loculus.backend.api.Organism
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.controller.DEFAULT_ORGANISM
import org.loculus.backend.controller.UnprocessableEntityException
import org.loculus.backend.service.files.FilesDatabaseService
import org.loculus.backend.service.files.S3Service
import java.util.UUID

class ValidateFileNameTest {
    private val backendConfig: BackendConfig = mockk()
    private val s3Service: S3Service = mockk()
    private val filesDatabaseService: FilesDatabaseService = mockk()
    private val validator = FileMappingPreconditionValidator(backendConfig, s3Service, filesDatabaseService)
    private val organism = Organism(DEFAULT_ORGANISM)

    @BeforeEach
    fun setUp() {
        every {
            backendConfig.getInstanceConfig(organism).schema.submissionDataTypes.files
                .disableStrictFilenameValidation
        } returns true
    }

    private fun createFileMapping(category: FileCategory, filenames: List<String>): FileCategoryFilesMap {
        val files = filenames.map { FileIdAndName(UUID.randomUUID(), it) }
        return mapOf(category to files)
    }

    @Test
    fun `valid filenames should pass base validation`() {
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
        validator.validateFilenameCharacters(fileMapping, organism)
    }

    @Test
    fun `unicode filenames should pass base validation`() {
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
        validator.validateFilenameCharacters(fileMapping, organism)
    }

    @Test
    fun `filenames with leading periods should pass base validation`() {
        val fileMapping = createFileMapping("sequences", listOf(".gitignore", ".hidden_file.txt"))
        validator.validateFilenameCharacters(fileMapping, organism)
    }

    @Test
    fun `empty filename should fail base validation`() {
        val fileMapping = createFileMapping("sequences", listOf(""))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `filename exceeding 255 characters should fail base validation`() {
        val longFilename = "a".repeat(256) + ".txt"
        val fileMapping = createFileMapping("sequences", listOf(longFilename))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `filename with less than sign should fail base validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file<test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `filename with greater than sign should fail base validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file>test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `filename with colon should fail base validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file:test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `filename with double quote should fail base validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file\"test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `filename with forward slash should fail base validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file/test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `filename with backslash should fail base validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file\\test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `filename with pipe should fail base validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file|test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `filename with question mark should fail base validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file?.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `filename with asterisk should fail base validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file*.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `filename with semicolon should fail base validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file;test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `filename with percent sign should fail base validation`() {
        val fileMapping = createFileMapping("sequences", listOf("50%.fastq"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `filename with hash should fail base validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file#1.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `filename with NUL should fail base validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file\u0000test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `filename with ASCII control character should fail base validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file\u0001test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `filename with whitespace should fail base validation`() {
        val fileMapping = createFileMapping("sequences", listOf("file test.txt"))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @ParameterizedTest(name = "{arguments}")
    @ValueSource(
        strings = [
            "CON", "PRN", "AUX", "NUL", "COM1", "COM9", "LPT1", "LPT9",
            "con", "Nul", "CON.txt", "nul.tar.gz",
        ],
    )
    fun `windows reserved device name should fail base validation`(filename: String) {
        val fileMapping = createFileMapping("sequences", listOf(filename))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @ParameterizedTest(name = "{arguments}")
    @ValueSource(strings = ["CONFIG.txt", "COM10.txt", "NULL.txt", "AUXILIARY.fasta", "my_CON.txt", ".CON"])
    fun `filename only resembling a windows reserved device name should pass base validation`(filename: String) {
        val fileMapping = createFileMapping("sequences", listOf(filename))
        validator.validateFilenameCharacters(fileMapping, organism)
    }

    @ParameterizedTest(name = "{arguments}")
    @ValueSource(strings = [".", ".."])
    fun `single and double period filename should fail base validation`(filename: String) {
        val fileMapping = createFileMapping("sequences", listOf(filename))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `null file mapping should pass base validation`() {
        validator.validateFilenameCharacters(null, organism)
    }

    @Test
    fun `empty file mapping should pass base validation`() {
        validator.validateFilenameCharacters(emptyMap(), organism)
    }

    @Test
    fun `multiple files with mixed valid and invalid names should fail base validation`() {
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
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @Test
    fun `valid filenames should pass strict validation`() {
        every {
            backendConfig.getInstanceConfig(organism).schema.submissionDataTypes.files
                .disableStrictFilenameValidation
        } returns false

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
        validator.validateFilenameCharacters(fileMapping, organism)
    }

    @Test
    fun `unicode filenames should fail strict validation`() {
        every {
            backendConfig.getInstanceConfig(organism).schema.submissionDataTypes.files
                .disableStrictFilenameValidation
        } returns false

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
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @ParameterizedTest(name = "{arguments}")
    @ValueSource(
        strings = [
            "file&name.txt", "file\$name.txt", "file'name.txt", "file(1).txt", "file+name.txt",
            "file,name.txt", "file=name.txt", "file@name.txt", "file~name.txt", "file!name.txt",
            "file[1].txt", "file{1}.txt",
        ],
    )
    fun `filename with characters outside the allowlist should fail strict validation`(filename: String) {
        every {
            backendConfig.getInstanceConfig(organism).schema.submissionDataTypes.files
                .disableStrictFilenameValidation
        } returns false

        val fileMapping = createFileMapping("sequences", listOf(filename))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }

    @ParameterizedTest(name = "{arguments}")
    @ValueSource(strings = ["CON.txt", "NUL", ".", ".."])
    fun `filename failing base validation should also fail strict validation`(filename: String) {
        every {
            backendConfig.getInstanceConfig(organism).schema.submissionDataTypes.files
                .disableStrictFilenameValidation
        } returns false

        val fileMapping = createFileMapping("sequences", listOf(filename))
        assertThrows<UnprocessableEntityException> {
            validator.validateFilenameCharacters(fileMapping, organism)
        }
    }
}
