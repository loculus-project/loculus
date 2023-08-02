package org.pathoplexus.backend.utils

import java.io.IOException
import java.io.OutputStream
import java.nio.charset.StandardCharsets

data class FastaEntry(val sampleName: String, val sequence: String) {
    fun writeToStream(outputStream: OutputStream) {
        try {
            outputStream.write(">".toByteArray(StandardCharsets.UTF_8))
            outputStream.write(sampleName.toByteArray(StandardCharsets.UTF_8))
            outputStream.write("\n".toByteArray(StandardCharsets.UTF_8))
            outputStream.write(sequence.toByteArray(StandardCharsets.UTF_8))
            outputStream.write("\n".toByteArray(StandardCharsets.UTF_8))
        } catch (e: IOException) {
            throw RuntimeException(e)
        }
    }
}
