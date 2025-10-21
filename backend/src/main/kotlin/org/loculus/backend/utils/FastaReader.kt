package org.loculus.backend.utils

import org.loculus.backend.controller.UnprocessableEntityException
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
                throw UnprocessableEntityException("No sequence data given for sample $fastaId.")
            }
            FastaEntry(fastaId, sequence.toString())
        }
    }

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
