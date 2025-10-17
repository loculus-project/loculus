package org.loculus.backend.service.submission.dbtables

import org.jetbrains.exposed.dao.IntEntity
import org.jetbrains.exposed.dao.IntEntityClass
import org.jetbrains.exposed.dao.id.EntityID
import org.jetbrains.exposed.dao.id.IntIdTable


private const val COMPRESSION_DICTIONARIES_TABLE_NAME = "compression_dictionaries_table"

object CompressionDictionariesTable : IntIdTable(COMPRESSION_DICTIONARIES_TABLE_NAME, "id") {
    val hashColumn = text("hash").uniqueIndex()
    val dictContentsColumn = text("dict_contents")
}

class CompressionDictionaryEntity(id: EntityID<Int>) : IntEntity(id) {
    companion object : IntEntityClass<CompressionDictionaryEntity>(CompressionDictionariesTable)

    var hash by CompressionDictionariesTable.hashColumn
    var dictContents by CompressionDictionariesTable.dictContentsColumn
}
