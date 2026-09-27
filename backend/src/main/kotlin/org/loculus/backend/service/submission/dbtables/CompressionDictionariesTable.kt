package org.loculus.backend.service.submission.dbtables

import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.core.dao.id.IntIdTable
import org.jetbrains.exposed.v1.dao.IntEntity
import org.jetbrains.exposed.v1.dao.IntEntityClass
import org.jetbrains.exposed.v1.datetime.datetime

const val COMPRESSION_DICTIONARIES_TABLE_NAME = "compression_dictionaries"

object CompressionDictionariesTable : IntIdTable(COMPRESSION_DICTIONARIES_TABLE_NAME, "id") {
    val hashColumn = char("hash", length = 64).uniqueIndex()
    val dictContentsColumn = binary("dict_contents")
    val descriptionColumn = text("description").nullable()
    val createdAt = datetime("created_at")
}

class CompressionDictionaryEntity(id: EntityID<Int>) : IntEntity(id) {
    companion object : IntEntityClass<CompressionDictionaryEntity>(CompressionDictionariesTable)

    var hash by CompressionDictionariesTable.hashColumn
    var dictContents by CompressionDictionariesTable.dictContentsColumn
    var description by CompressionDictionariesTable.descriptionColumn
    var createdAt by CompressionDictionariesTable.createdAt
}
