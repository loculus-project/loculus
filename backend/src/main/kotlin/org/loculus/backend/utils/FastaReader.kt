package org.loculus.backend.utils

import org.loculus.backend.errors.UnprocessableEntityException
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader

data class FastaEntry(val fastaId: String, val sequence: String)

class FastaReader(inputStream: InputStream) :
    Iterator<FastaEntry>,
    Iterable<FastaEntry>,
    AutoCloseable {
    private val reader: BufferedReader = BufferedReader(InputStreamReader(inputStream))
    private var nextEntry: FastaEntry? = null
    private var nextLine: String? = ""

    init {
        read()
    }

    override fun hasNext(): Boolean = nextEntry != null

    override fun next(): FastaEntry {
        val entry = nextEntry ?: throw NoSuchElementException("No element available")
        read()
        return entry
    }

    private fun read() {
        var fastaId: String? = null
        val sequence = StringBuilder()
        while (true) {
            if (nextLine == null) {
                break
            }
            if (nextLine!!.isBlank()) {
                nextLine = reader.readLine()
                continue
            }
            if (nextLine!!.startsWith(">")) {
                if (fastaId != null) {
                    break
                }
                fastaId = nextLine!!.substring(1).split("\\s+".toRegex())[0]
            } else {
                sequence.append(nextLine)
            }
            nextLine = reader.readLine()
        }
        nextEntry = if (fastaId == null) {
            null
        } else {
            if (sequence.isEmpty()) {
                throw UnprocessableEntityException(
                    "FASTA sequence with id `$fastaId` is empty (does not contain at least a single nucleotide).",
                )
            }
            validateSequenceCharacters(fastaId, sequence)
            FastaEntry(fastaId, sequence.toString())
        }
    }

    /**
     * Rejects sequences containing characters that cannot appear in a plain-text sequence, i.e. anything
     * outside printable ASCII (plus tab). This catches binary files (e.g. Word documents or other archives)
     * uploaded in place of a FASTA file, which would otherwise be accepted here and then fail later on
     * (e.g. Postgres rejects the NUL characters they contain when the processed data is stored).
     */
    private fun validateSequenceCharacters(fastaId: String, sequence: CharSequence) {
        val invalidIndex = sequence.indexOfFirst { !isAllowedSequenceCharacter(it) }
        if (invalidIndex == -1) {
            return
        }
        val codePoint = "U+%04X".format(sequence[invalidIndex].code)
        throw UnprocessableEntityException(
            "FASTA sequence with id `$fastaId` contains an invalid character ($codePoint) at position " +
                "${invalidIndex + 1}. Sequences must be plain text - this can happen if a binary file " +
                "(such as a Word document) was uploaded instead of a FASTA file.",
        )
    }

    // Printable ASCII (' ' = 0x20 through '~' = 0x7E) plus tab. Line breaks don't need to be allowed
    // because the sequence is assembled from lines returned by readLine(), which strips them.
    private fun isAllowedSequenceCharacter(char: Char): Boolean = char == '\t' || char in ' '..'~'

    override fun close() {
        reader.close()
    }

    override fun iterator(): Iterator<FastaEntry> = this

    fun asSequence(): Sequence<FastaEntry> = sequence {
        while (hasNext()) {
            yield(next())
        }
    }
}
