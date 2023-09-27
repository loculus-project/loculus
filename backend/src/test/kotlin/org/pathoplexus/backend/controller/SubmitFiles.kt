package org.pathoplexus.backend.controller

import org.springframework.http.MediaType.TEXT_PLAIN_VALUE
import org.springframework.mock.web.MockMultipartFile

private const val DEFAULT_METADATA_FILE_NAME = "metadata.tsv"
private const val REVISED_METADATA_FILE_NAME = "revised_metadata.tsv"
private const val DEFAULT_SEQUENCES_FILE_NAME = "sequences.fasta"

object SubmitFiles {
    object DefaultFiles {
        val metadataFile = metadataFileWith(content = getFileContent(DEFAULT_METADATA_FILE_NAME))
        val revisedMetadataFile = metadataFileWith(content = getFileContent(REVISED_METADATA_FILE_NAME))
        val sequencesFile = sequenceFileWith(content = getFileContent(DEFAULT_SEQUENCES_FILE_NAME))

        const val NUMBER_OF_SEQUENCES = 10
        val allSequenceIds = (1L..NUMBER_OF_SEQUENCES).toList()
        val firstSequence = allSequenceIds[0]

        private fun getFileContent(file: String): String {
            return String(
                this::class.java.classLoader.getResourceAsStream(file)?.readBytes() ?: error(
                    "$file resource for tests not found",
                ),
            )
        }
    }

    fun metadataFileWith(
        name: String = "metadataFile",
        originalFilename: String = "metadata.tsv",
        mediaType: String = TEXT_PLAIN_VALUE,
        content: String = "header\tfirstColumn\nsomeHeader\tsomeValue\nsomeHeader2\tsomeValue2",
    ): MockMultipartFile {
        return MockMultipartFile(
            name,
            originalFilename,
            mediaType,
            content.byteInputStream(),
        )
    }

    fun sequenceFileWith(
        name: String = "sequenceFile",
        originalFilename: String = "sequences.fasta",
        mediaType: String = TEXT_PLAIN_VALUE,
        content: String = ">someHeader\nAC\n>someHeader2\nAC",
    ) = MockMultipartFile(
        name,
        originalFilename,
        mediaType,
        content.byteInputStream(),
    )
}
