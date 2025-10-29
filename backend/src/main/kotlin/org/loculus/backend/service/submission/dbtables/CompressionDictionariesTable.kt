package org.loculus.backend.service.submission.dbtables

import org.jetbrains.exposed.dao.IntEntity
import org.jetbrains.exposed.dao.IntEntityClass
import org.jetbrains.exposed.dao.id.EntityID
import org.jetbrains.exposed.dao.id.IntIdTable

const val COMPRESSION_DICTIONARIES_TABLE_NAME = "compression_dictionaries"

object CompressionDictionariesTable : IntIdTable(COMPRESSION_DICTIONARIES_TABLE_NAME, "id") {
    val hashColumn = text("hash").uniqueIndex()
    val dictContentsColumn = binary("dict_contents")
}

class CompressionDictionaryEntity(id: EntityID<Int>) : IntEntity(id) {
    companion object : IntEntityClass<CompressionDictionaryEntity>(CompressionDictionariesTable)

    var hash by CompressionDictionariesTable.hashColumn
    var dictContents by CompressionDictionariesTable.dictContentsColumn
}
