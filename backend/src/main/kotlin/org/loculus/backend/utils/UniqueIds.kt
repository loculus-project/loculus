package org.loculus.backend.utils

fun makeUniqueIds(ids: List<String>): List<String> {
    val originalIds = ids.toSet()
    val usedIds = mutableSetOf<String>()

    return ids.map { id ->
        if (usedIds.add(id)) {
            id
        } else {
            nextUniqueId(id, originalIds, usedIds)
        }
    }
}

private fun nextUniqueId(id: String, originalIds: Set<String>, usedIds: MutableSet<String>): String {
    var suffix = 1
    while (true) {
        val candidate = "${id}_$suffix"
        if (candidate !in originalIds && usedIds.add(candidate)) {
            return candidate
        }
        suffix++
    }
}
