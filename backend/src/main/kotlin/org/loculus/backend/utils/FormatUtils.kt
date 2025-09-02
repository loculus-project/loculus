package org.loculus.backend.utils

fun formatBytesHuman(bytes: Long): String = when {
    bytes >= 1024L * 1024L * 1024L -> "${bytes / (1024L * 1024L * 1024L)}GB"
    bytes >= 1024L * 1024L -> "${bytes / (1024L * 1024L)}MB"
    bytes >= 1024L -> "${bytes / 1024L}KB"
    else -> "${bytes}B"
}
