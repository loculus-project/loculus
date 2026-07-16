package org.loculus.backend.service.seqsetcitations

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.loculus.backend.api.CitationContributor
import org.loculus.backend.api.CitationOrigin
import org.loculus.backend.service.jacksonSerializableJsonb

object SeqSetsTable : Table("seqsets") {
    val seqSetId = varchar("seqset_id", 255)
    val seqSetVersion = long("seqset_version")
    val name = varchar("name", 255)
    val description = varchar("description", 255)
    val seqSetDOI = varchar("seqset_doi", 255).nullable()
    val createdAt = datetime("created_at")
    val createdBy = varchar("created_by", 255)
    override val primaryKey = PrimaryKey(seqSetId, seqSetVersion)
}

object SeqSetRecordsTable : Table("seqset_records") {
    val seqSetRecordId = long("seqset_record_id").autoIncrement()
    val accession = varchar("accession", 255)
    val type = varchar("type", 255)
    val isFocal = bool("is_focal").default(true)
    override val primaryKey = PrimaryKey(seqSetRecordId)
}

object SeqSetToRecordsTable : Table("seqset_to_records") {
    val seqSetRecordId = long("seqset_record_id") references SeqSetRecordsTable.seqSetRecordId
    val seqSetId = varchar("seqset_id", 255) references SeqSetsTable.seqSetId
    val seqSetVersion = long("seqset_version") references SeqSetsTable.seqSetVersion
    override val primaryKey = PrimaryKey(seqSetRecordId, seqSetId, seqSetVersion)
}

object SeqSetCitationSourceTable : Table("seqset_citation_source") {
    val citationSourceId = long("citation_source_id").autoIncrement()
    val sourceDOI = text("source_doi").uniqueIndex()
    val origin = customEnumeration(
        name = "origin",
        sql = "text",
        fromDb = { CitationOrigin.valueOf(it as String) },
        toDb = { it.name },
    )
    val title = text("title")
    val year = integer("year")
    val contributors = jacksonSerializableJsonb<List<CitationContributor>>("contributors")
    val journal = text("journal").nullable()
    override val primaryKey = PrimaryKey(citationSourceId)
}

object SeqSetToCitationSourceTable : Table("seqset_to_citation_source") {
    val citationSourceId = long("citation_source_id") references SeqSetCitationSourceTable.citationSourceId
    val seqSetId = text("seqset_id") references SeqSetsTable.seqSetId
    val seqSetVersion = long("seqset_version") references SeqSetsTable.seqSetVersion
    override val primaryKey = PrimaryKey(citationSourceId, seqSetId, seqSetVersion)
}
