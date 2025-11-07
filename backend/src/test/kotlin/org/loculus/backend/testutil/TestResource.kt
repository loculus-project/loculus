package org.loculus.backend.testutil

import java.io.File

class TestResource(file: String) {
    val file = File(
        this::class.java.classLoader.getResource(file)?.file
            ?: throw IllegalArgumentException("Test resource not found: $file"),
    )

    val content = this.file.readText()
}
