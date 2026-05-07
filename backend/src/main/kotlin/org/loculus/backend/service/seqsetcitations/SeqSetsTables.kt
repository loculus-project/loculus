package org.loculus.backend.service.seqsetcitations

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.loculus.backend.api.SeqSetCitationContributor
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

object SeqSetCitationsTable : Table("seqset_citations") {
    val seqSetDOI = varchar("seqset_doi", 255)
    val citationDOI = varchar("citation_doi", 255)
    val title = text("title")
    val year = varchar("year", 10)
    val contributors = jacksonSerializableJsonb<List<SeqSetCitationContributor>>("contributors")
    val lastFetched = datetime("last_fetched") // TODO: Update naming
    override val primaryKey = PrimaryKey(seqSetDOI, citationDOI)
}
