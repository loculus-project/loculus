package org.pathoplexus.backend.config

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.stereotype.Component

@Component
@ConfigurationProperties("database")
data class DatabaseProperties(
    var jdbcUrl: String = "",
    var name: String = "",
    var username: String = "",
    var password: String = "",
)
