package org.loculus.backend.utils

import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader

data class FastaEntry(val sampleName: String, val sequence: String)

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
        var sampleName: String? = null
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
                if (sampleName != null) {
                    break
                }
                sampleName = nextLine!!.substring(1)
            } else {
                sequence.append(nextLine)
            }
            nextLine = reader.readLine()
        }
        nextEntry = if (sampleName == null) {
            null
        } else {
            FastaEntry(sampleName, sequence.toString())
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
