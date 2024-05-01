package org.loculus.backend

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class BackendApplication

fun main(args: Array<String>) {
    println("Test")
    runApplication<BackendApplication>(*args)
}
