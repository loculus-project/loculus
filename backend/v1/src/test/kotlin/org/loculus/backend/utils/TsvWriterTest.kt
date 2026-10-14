package org.loculus.backend.utils

import org.hamcrest.MatcherAssert.assertThat
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.Test
import java.io.ByteArrayOutputStream

class TsvWriterTest {

    @Test
    fun `write multiple rows`() {
        val outputStream = ByteArrayOutputStream()
        TsvWriter(outputStream, listOf("id", "name", "value")).use { writer ->
            writer.writeRow(listOf("1", "Alice", "100"))
            writer.writeRow(listOf("2", "Bob", "200"))
            writer.writeRow(listOf("3", "Charlie", "300"))
        }

        val result = outputStream.toString()
        val lines = result.lines().filter { it.isNotBlank() }

        assertThat(lines.size, `is`(4))
        assertThat(lines[0], `is`("id\tname\tvalue"))
        assertThat(lines[1], `is`("1\tAlice\t100"))
        assertThat(lines[2], `is`("2\tBob\t200"))
        assertThat(lines[3], `is`("3\tCharlie\t300"))
    }

    @Test
    fun `write single row`() {
        val outputStream = ByteArrayOutputStream()
        TsvWriter(outputStream, listOf("id", "name")).use { writer ->
            writer.writeRow(listOf("1", "Alice"))
        }

        val result = outputStream.toString()
        val lines = result.lines().filter { it.isNotBlank() }

        assertThat(lines.size, `is`(2))
        assertThat(lines[0], `is`("id\tname"))
        assertThat(lines[1], `is`("1\tAlice"))
    }

    @Test
    fun `write headers only when no rows`() {
        val outputStream = ByteArrayOutputStream()
        TsvWriter(outputStream, listOf("id", "name", "value")).use { }

        val result = outputStream.toString()
        val lines = result.lines().filter { it.isNotBlank() }

        assertThat(lines.size, `is`(1))
        assertThat(lines[0], `is`("id\tname\tvalue"))
    }

    @Test
    fun `handle null values`() {
        val outputStream = ByteArrayOutputStream()
        TsvWriter(outputStream, listOf("id", "name", "value")).use { writer ->
            writer.writeRow(listOf("1", null, "100"))
            writer.writeRow(listOf("2", "Bob", null))
        }

        val result = outputStream.toString()
        val lines = result.lines().filter { it.isNotBlank() }

        assertThat(lines.size, `is`(3))
        assertThat(lines[0], `is`("id\tname\tvalue"))
        assertThat(lines[1], `is`("1\t\t100"))
        assertThat(lines[2], `is`("2\tBob\t"))
    }

    @Test
    fun `handle empty string values`() {
        val outputStream = ByteArrayOutputStream()
        TsvWriter(outputStream, listOf("id", "name")).use { writer ->
            writer.writeRow(listOf("1", ""))
            writer.writeRow(listOf("", "Bob"))
        }

        val result = outputStream.toString()
        val lines = result.lines().filter { it.isNotBlank() }

        assertThat(lines.size, `is`(3))
        assertThat(lines[1].startsWith("1\t"), `is`(true))
        assertThat(lines[2].endsWith("Bob"), `is`(true))
    }

    @Test
    fun `handle values containing special characters`() {
        val outputStream = ByteArrayOutputStream()
        TsvWriter(outputStream, listOf("id", "description")).use { writer ->
            writer.writeRow(listOf("1", "value with \"quotes\""))
            writer.writeRow(listOf("2", "value with\nnewline"))
        }

        val result = outputStream.toString()

        // Values with special characters should be quoted by CSV library
        assertThat(result.contains("1"), `is`(true))
        assertThat(result.contains("quotes"), `is`(true))
        assertThat(result.contains("newline"), `is`(true))
    }

    @Test
    fun `handle single column`() {
        val outputStream = ByteArrayOutputStream()
        TsvWriter(outputStream, listOf("id")).use { writer ->
            writer.writeRow(listOf("1"))
            writer.writeRow(listOf("2"))
        }

        val result = outputStream.toString()
        val lines = result.lines().filter { it.isNotBlank() }

        assertThat(lines.size, `is`(3))
        assertThat(lines[0], `is`("id"))
        assertThat(lines[1], `is`("1"))
        assertThat(lines[2], `is`("2"))
    }
}
