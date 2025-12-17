package org.loculus.backend

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication(
    // TODO(#5754) Remove shim once exposed supports spring boot 4
    // TODO(#5754) Remove shim once exposed supports spring boot 4
    excludeName = ["org.jetbrains.exposed.spring.autoconfigure.ExposedAutoConfiguration"],
)
class BackendApplication

fun main(args: Array<String>) {
    runApplication<BackendApplication>(*args)
}
