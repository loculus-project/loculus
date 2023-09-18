package org.pathoplexus.backend.model

data class HeaderId(
    val sequenceId: Long,
    val version: Int,
    val customId: String,
)
