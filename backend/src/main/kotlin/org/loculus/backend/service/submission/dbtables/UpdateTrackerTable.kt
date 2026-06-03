package org.loculus.backend.service.submission

import org.jetbrains.exposed.sql.Table

const val UPDATE_TRACKER_TABLE_NAME = "table_update_tracker"

object UpdateTrackerTable : Table(UPDATE_TRACKER_TABLE_NAME) {
    val tableNameColumn = text("table_name")

    // Organism and pipeline version dimensions. Table-wide writes leave both NULL
    // ("applies to every organism / pipeline version"); preprocessed-data writes
    // are tagged with the actual organism and pipeline version (see V1.28
    // migration). Uniqueness over (table_name, organism, pipeline_version) is
    // enforced by a UNIQUE NULLS NOT DISTINCT constraint in the database rather
    // than a primary key, since the dimension columns are nullable.
    val organismColumn = text("organism").nullable()
    val pipelineVersionColumn = long("pipeline_version").nullable()
    val lastTimeUpdatedDbColumn = text("last_time_updated")
}
