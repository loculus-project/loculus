package org.loculus.backend.utils

import org.apache.commons.csv.CSVFormat
import org.apache.commons.csv.CSVPrinter
import java.io.OutputStream

class TsvWriter(outputStream: OutputStream, headers: List<String>) : AutoCloseable {
    private val writer = outputStream.bufferedWriter()
    private val printer: CSVPrinter = CSVFormat.TDF.builder()
        .setHeader(*headers.toTypedArray())
        .get()
        .print(writer)

    fun writeRow(values: List<String?>) {
        printer.printRecord(values)
    }

    override fun close() {
        printer.flush()
    }
}
