package org.loculus.backend.utils

import java.io.OutputStream

class FastaWriter(outputStream: OutputStream) : AutoCloseable {
    private val writer = outputStream.bufferedWriter()

    fun write(entry: FastaEntry) {
        writer.write(">")
        writer.write(entry.fastaId)
        writer.newLine()
        writer.write(entry.sequence)
        writer.newLine()
    }

    fun writeAll(entries: Iterable<FastaEntry>) {
        for (entry in entries) {
            write(entry)
        }
    }

    override fun close() {
        writer.flush()
    }
}
