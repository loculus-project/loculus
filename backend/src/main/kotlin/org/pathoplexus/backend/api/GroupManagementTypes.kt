package org.pathoplexus.backend.api

data class Group(
    val groupName: String,
)

data class User(
    val name: String,
)

data class GroupDetails(
    val groupName: String,
    val users: List<User>,
)
