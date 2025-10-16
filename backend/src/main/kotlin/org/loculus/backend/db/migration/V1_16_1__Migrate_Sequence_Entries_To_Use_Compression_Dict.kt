package org.loculus.backend.db.migration

import org.flywaydb.core.api.migration.BaseJavaMigration
import org.flywaydb.core.api.migration.Context
import org.loculus.backend.config.BackendConfig
import org.springframework.stereotype.Component
import java.security.MessageDigest

@Component
class V1_16_1__Migrate_Sequence_Entries_To_Use_Compression_Dict(
    private val backendConfig: BackendConfig,
) : BaseJavaMigration() {

    override fun migrate(context: Context) {
        println("--------------------------- Migrating V3_Migration -------------------------------")
        println(backendConfig)

//        val connection = context.connection
//
//        connection.prepareStatement("""
//            INSERT INTO dict_table (id, hash, dict_contents)
//            VALUES (?, ?, ?)
//            ON CONFLICT (hash) DO NOTHING
//        """).use { insertStmt ->
//
//            // Insert dictionaries for aligned sequences (genes/segments)
//            backendConfig.organismSchemas.forEach { organismSchema ->
//                organismSchema.referenceSequences.forEach { referenceSequence ->
//                    val dict = referenceSequence.sequence
//                    val hash = md5(dict)
//                    val id = generateDictId(organismSchema.organism, referenceSequence.name)
//
//                    insertStmt.setString(1, id)
//                    insertStmt.setString(2, hash)
//                    insertStmt.setString(3, dict)
//                    insertStmt.addBatch()
//                }
//
//                // Insert dictionary for unaligned sequences
//                val unalignedDict = organismSchema.nucSequences.joinToString("") { it.sequence }
//                val hash = md5(unalignedDict)
//                val id = generateUnalignedDictId(organismSchema.organism)
//
//                insertStmt.setString(1, id)
//                insertStmt.setString(2, hash)
//                insertStmt.setString(3, unalignedDict)
//                insertStmt.addBatch()
//            }
//
//            insertStmt.executeBatch()
//        }
    }

    private fun md5(input: String): String {
        val md = MessageDigest.getInstance("MD5")
        val digest = md.digest(input.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun generateDictId(organism: String, segmentOrGene: String): String {
        return "${organism}_${segmentOrGene}"
    }

    private fun generateUnalignedDictId(organism: String): String {
        return "${organism}_unaligned"
    }
}
