package org.loculus.backend.controller.submission

import java.io.ByteArrayInputStream
import java.util.zip.ZipInputStream

/**
 * Extracts the metadata.tsv and sequences.fasta contents from a downloaded submitted-data zip.
 *
 * @return a pair of (metadata.tsv content, sequences.fasta content)
 */
fun extractSubmittedDataZipContents(zipContent: ByteArray): Pair<String, String> {
    var metadataTsv = ""
    var sequencesFasta = ""

    ZipInputStream(ByteArrayInputStream(zipContent)).use { zis ->
        var entry = zis.nextEntry
        while (entry != null) {
            val content = zis.readBytes().decodeToString()
            when (entry.name) {
                "metadata.tsv" -> metadataTsv = content
                "sequences.fasta" -> sequencesFasta = content
            }
            entry = zis.nextEntry
        }
    }

    return Pair(metadataTsv, sequencesFasta)
}
