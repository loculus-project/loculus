package org.loculus.backend.service.submission.dbtables

import org.jetbrains.exposed.dao.IntEntity
import org.jetbrains.exposed.dao.IntEntityClass
import org.jetbrains.exposed.dao.id.EntityID
import org.jetbrains.exposed.dao.id.IntIdTable
import org.jetbrains.exposed.sql.kotlin.datetime.datetime

const val COMPRESSION_DICTIONARIES_TABLE_NAME = "compression_dictionaries"

object CompressionDictionariesTable : IntIdTable(COMPRESSION_DICTIONARIES_TABLE_NAME, "id") {
    val hashColumn = char("hash", length = 64).uniqueIndex()
    val dictContentsColumn = binary("dict_contents")
    val createdAt = datetime("created_at")
}

class CompressionDictionaryEntity(id: EntityID<Int>) : IntEntity(id) {
    companion object : IntEntityClass<CompressionDictionaryEntity>(CompressionDictionariesTable)

    var hash by CompressionDictionariesTable.hashColumn
    var dictContents by CompressionDictionariesTable.dictContentsColumn
    var createdAt by CompressionDictionariesTable.createdAt
}
