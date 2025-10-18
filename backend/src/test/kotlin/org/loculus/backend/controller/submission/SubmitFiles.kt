package org.loculus.backend.controller.submission

import org.apache.commons.compress.compressors.bzip2.BZip2CompressorOutputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorOutputStream
import org.apache.commons.compress.compressors.xz.XZCompressorOutputStream
import org.apache.commons.compress.compressors.zstandard.ZstdCompressorOutputStream
import org.loculus.backend.service.submission.CompressionAlgorithm
import org.loculus.backend.utils.Accession
import org.springframework.http.MediaType.TEXT_PLAIN_VALUE
import org.springframework.mock.web.MockMultipartFile
import org.tukaani.xz.LZMA2Options
import org.tukaani.xz.XZOutputStream
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

private const val DEFAULT_METADATA_FILE_NAME = "metadata.tsv"
private const val DEFAULT_MULTI_SEGMENTED_METADATA_FILE_NAME = "metadata_multi_segment.tsv"
private const val REVISED_METADATA_FILE_NAME = "revised_metadata.tsv"
private const val REVISED_MULTI_SEGMENTED_METADATA_FILE_NAME = "revised_metadata_multi_segment.tsv"
private const val DEFAULT_SEQUENCES_FILE_NAME = "sequences.fasta"
private const val DEFAULT_MULTI_SEGMENTED_SEQUENCES_FILE_NAME = "sequences_multi_segment.fasta"

object SubmitFiles {

    object DefaultFiles {

        val dummyRevisedMetadataFile = metadataFileWith(
            content = "accession\tsubmissionId\tfirstColumn\n" +
                "someAccession\tsomeHeader\tsomeValue\n" +
                "someOtherAccession\tsomeHeader2\tsomeValue2",
        )

        fun getRevisedMultiSegmentedMetadataFile(accessions: List<Accession>): MockMultipartFile {
            val fileContent = getFileContent(REVISED_MULTI_SEGMENTED_METADATA_FILE_NAME)

            val lines = fileContent.trim().split("\n").toMutableList()
            val headerLine = lines.removeFirst()

            val revisedLines = lines
                .map { it.substringAfter('\t') }
                .zip(accessions)
                .map { (line, accession) -> "$accession\t$line" }
                .toMutableList()

            revisedLines.addFirst(headerLine)

            return metadataFileWith(content = revisedLines.joinToString("\n"))
        }

        fun getRevisedMetadataFile(accessions: List<Accession>): MockMultipartFile {
            val fileContent = getFileContent(REVISED_METADATA_FILE_NAME)

            val lines = fileContent.trim().split("\n").toMutableList()
            val headerLine = lines.removeFirst()

            val revisedLines = lines
                .map { it.substringAfter('\t') }
                .zip(accessions)
                .map { (line, accession) -> "$accession\t$line" }
                .toMutableList()

            revisedLines.addFirst(headerLine)

            return metadataFileWith(content = revisedLines.joinToString("\n"))
        }

        val metadataFiles = CompressionAlgorithm.entries.associateWith {
            metadataFileWith(
                content = getFileContent(DEFAULT_METADATA_FILE_NAME),
                compression = it,
            )
        }
        val sequencesFiles = CompressionAlgorithm.entries.associateWith {
            sequenceFileWith(
                content = getFileContent(DEFAULT_SEQUENCES_FILE_NAME),
                compression = it,
            )
        }
        private val metadataFilesMultiSegmented = CompressionAlgorithm.entries.associateWith {
            metadataFileWith(
                content = getFileContent(DEFAULT_MULTI_SEGMENTED_METADATA_FILE_NAME),
                compression = it,
            )
        }
        private val sequencesFilesMultiSegmented = CompressionAlgorithm.entries.associateWith {
            sequenceFileWith(
                content = getFileContent(DEFAULT_MULTI_SEGMENTED_SEQUENCES_FILE_NAME),
                compression = it,
            )
        }
        val multiSegmentedMetadataFile = metadataFilesMultiSegmented[CompressionAlgorithm.NONE]
            ?: error("No multi-segment metadata file")
        val metadataFile = metadataFiles[CompressionAlgorithm.NONE] ?: error("No metadata file")
        val sequencesFile = sequencesFiles[CompressionAlgorithm.NONE] ?: error("No sequences file")
        val sequencesFileMultiSegmented = sequencesFilesMultiSegmented[CompressionAlgorithm.NONE] ?: error(
            "No multi-segment sequences file",
        )
        val submissionIds = List(10) { "custom$it" }

        const val NUMBER_OF_SEQUENCES = 10

        private fun getFileContent(file: String): String = String(
            this::class.java.classLoader.getResourceAsStream(file)?.readBytes() ?: error(
                "$file resource for tests not found",
            ),
        )
    }

    fun metadataFileWith(
        name: String = "metadataFile",
        originalFilename: String = "metadata.tsv",
        mediaType: String = TEXT_PLAIN_VALUE,
        content: String = "submissionId\tfirstColumn\nsomeHeader\tsomeValue\nsomeHeader2\tsomeValue2",
        compression: CompressionAlgorithm = CompressionAlgorithm.NONE,
    ): MockMultipartFile {
        val contentStream = compressString(content, compression)
        return MockMultipartFile(
            name,
            originalFilename + compression.extension,
            mediaType,
            contentStream,
        )
    }

    fun revisedMetadataFileWith(
        name: String = "metadataFile",
        originalFilename: String = "metadata.tsv",
        mediaType: String = TEXT_PLAIN_VALUE,
        content: String = "accession\tsubmissionId\tfirstColumn\n1\tsomeHeader\tsomeValue\n2\tsomeHeader2\tsomeValue2",
    ): MockMultipartFile = MockMultipartFile(
        name,
        originalFilename,
        mediaType,
        content.byteInputStream(),
    )

    fun sequenceFileWith(
        name: String = "sequenceFile",
        originalFilename: String = "sequences.fasta",
        mediaType: String = TEXT_PLAIN_VALUE,
        content: String = ">someHeader_main\nAC\n>someHeader2_main\nAC",
        compression: CompressionAlgorithm = CompressionAlgorithm.NONE,
    ): MockMultipartFile {
        val contentStream = compressString(content, compression)
        return MockMultipartFile(
            name,
            originalFilename + compression.extension,
            mediaType,
            contentStream,
        )
    }
}

fun compressString(input: String, compressionAlgorithm: CompressionAlgorithm): ByteArray = try {
    when (compressionAlgorithm) {
        CompressionAlgorithm.ZSTD -> compressZstd(input)
        CompressionAlgorithm.XZ -> compressXZ(input)
        CompressionAlgorithm.GZIP -> compressGzip(input)
        CompressionAlgorithm.ZIP -> compressZip(input)
        CompressionAlgorithm.BZIP2 -> compressBzip2(input)
        CompressionAlgorithm.LZMA -> compressLzma(input)
        CompressionAlgorithm.NONE -> input.toByteArray()
    }
} catch (e: Exception) {
    throw RuntimeException("Error compressing the string with $compressionAlgorithm")
}

fun compressBzip2(input: String): ByteArray = ByteArrayOutputStream().use { byteArrayOutputStream ->
    BZip2CompressorOutputStream(byteArrayOutputStream).use { bzip2Out ->
        bzip2Out.write(input.toByteArray())
    }
    byteArrayOutputStream.toByteArray()
}

fun compressGzip(input: String): ByteArray = ByteArrayOutputStream().use { byteArrayOutputStream ->
    GzipCompressorOutputStream(byteArrayOutputStream).use { gzipOut ->
        gzipOut.write(input.toByteArray())
    }
    byteArrayOutputStream.toByteArray()
}

fun compressXZ(input: String): ByteArray = ByteArrayOutputStream().use { byteArrayOutputStream ->
    XZCompressorOutputStream(byteArrayOutputStream).use { xzOut ->
        xzOut.write(input.toByteArray())
    }
    byteArrayOutputStream.toByteArray()
}

fun compressZstd(input: String): ByteArray = ByteArrayOutputStream().use { byteArrayOutputStream ->
    ZstdCompressorOutputStream(byteArrayOutputStream).use { zstdOut ->
        zstdOut.write(input.toByteArray())
    }
    byteArrayOutputStream.toByteArray()
}

fun compressZip(input: String): ByteArray = ByteArrayOutputStream().use { byteArrayOutputStream ->
    ZipOutputStream(byteArrayOutputStream).use { zipOut ->
        zipOut.putNextEntry(ZipEntry("data.txt"))
        zipOut.write(input.toByteArray())
        zipOut.closeEntry()
    }
    byteArrayOutputStream.toByteArray()
}

fun compressLzma(input: String): ByteArray {
    val byteArrayOutputStream = ByteArrayOutputStream()
    XZOutputStream(byteArrayOutputStream, LZMA2Options()).use { lzmaOut ->
        lzmaOut.write(input.toByteArray())
    }
    return byteArrayOutputStream.toByteArray()
}
