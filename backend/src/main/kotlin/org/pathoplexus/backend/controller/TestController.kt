package org.pathoplexus.backend.controller

import org.pathoplexus.backend.service.DatabaseService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class TestController(
    private val databaseService: DatabaseService,
) {

    @GetMapping("/test")
    fun test(): Int {
        return databaseService.testConnection()
    }
}
