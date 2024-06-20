package org.loculus.backend.service.seqsetcitations

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.kotlin.datetime.datetime
import org.loculus.backend.service.submission.SequenceEntriesTable

object SeqSetsTable : Table("seqsets") {
    val seqSetId = uuid("seqset_id").autoGenerate()
    val seqSetVersion = long("seqset_version")
    val name = varchar("name", 255)
    val description = varchar("description", 255)
    val seqSetDOI = varchar("seqset_doi", 255)
    val createdAt = datetime("created_at")
    val createdBy = varchar("created_by", 255)
    override val primaryKey = PrimaryKey(seqSetId, seqSetVersion)
}

object SeqSetToRecordsTable : Table("seqset_to_records") {
    val seqSetId = uuid("seqset_id") references SeqSetsTable.seqSetId
    val seqSetVersion = long("seqset_version") references SeqSetsTable.seqSetVersion
    val sequenceAccession = varchar("sequence_accession", 255)
    val isFocal = bool("is_focal")
    override val primaryKey = PrimaryKey(seqSetId, seqSetVersion, sequenceAccession)
}
