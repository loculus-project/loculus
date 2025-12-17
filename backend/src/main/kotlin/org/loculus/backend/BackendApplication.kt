package org.loculus.backend

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication(
    excludeName = ["org.jetbrains.exposed.spring.autoconfigure.ExposedAutoConfiguration"],
)
class BackendApplication

fun main(args: Array<String>) {
    runApplication<BackendApplication>(*args)
}
