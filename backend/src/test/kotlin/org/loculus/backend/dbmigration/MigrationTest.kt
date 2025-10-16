package org.loculus.backend.dbmigration

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.loculus.backend.controller.EndpointTest
import org.springframework.beans.factory.annotation.Autowired
import javax.sql.DataSource

@EndpointTest
class CompressionDictMigrationTest(
    @Autowired private var flyway: Flyway,
    @Autowired private val dataSource: DataSource,
) {


//    @BeforeEach
//    fun setup() {
//        // Create a fresh Flyway instance with full control
//        flyway = Flyway.configure()
//            .dataSource(dataSource)
//            .locations("classpath:db/migration")
//            .cleanDisabled(false)
//            .load()
//
//        // Start with a clean database
//        flyway.clean()
//    }

    @Test
    fun `test compression dictionary migration`() {
        // Step 1: Migrate up to (but not including) the dict_table creation
        val targetVersion = "001" // version before dict_table creation
//        flyway.migrate() // or flyway.target(targetVersion).migrate()

        // Step 2: Prepare test data in the old schema
        insertTestSequenceData()

        // Step 3: Verify old data structure (no dictionaryId yet)
//        verifyOldDataStructure()
//
//        // Step 4: Continue migration to create dict_table
//        val createDictTableVersion = "002" // version that creates dict_table
//        Flyway.configure()
//            .dataSource(dataSource)
//            .locations("classpath:db/migration")
//            .target(MigrationVersion.fromVersion(createDictTableVersion))
//            .load()
//            .migrate()
//
//        // Step 5: Verify dict_table exists but is empty
//        verifyDictTableExists()
//        verifyDictTableIsEmpty()
//
//        // Step 6: Run the population migration
//        val populateDictsVersion = "003" // version that populates dicts
//        Flyway.configure()
//            .dataSource(dataSource)
//            .locations("classpath:db/migration")
//            .target(MigrationVersion.fromVersion(populateDictsVersion))
//            .load()
//            .migrate()
//
//        // Step 7: Verify dictionaries were inserted correctly
//        verifyDictionariesPopulated()
//
//        // Step 8: Run the data migration that adds dictionaryId
//        val addDictIdVersion = "004" // version that adds dictionaryId to sequences
//        Flyway.configure()
//            .dataSource(dataSource)
//            .locations("classpath:db/migration")
//            .target(MigrationVersion.fromVersion(addDictIdVersion))
//            .load()
//            .migrate()
//
//        // Step 9: Verify sequences now have dictionaryId
//        verifySequencesHaveDictionaryId()
//
//        // Step 10: Verify we can decompress using the dictionaryId
//        verifyDecompressionWorks()
    }

    private fun insertTestSequenceData() {
        dataSource.connection.use { conn ->
            conn.prepareStatement(
                """
                INSERT INTO sequence_table (id, organism, data)
                VALUES (?, ?, ?::jsonb)
            """,
            ).use { stmt ->
                stmt.setString(1, "test-seq-1")
                stmt.setString(2, "h5n1")
                stmt.setString(
                    3,
                    """
                    {
                      "metadata": { "country": "Germany" },
                      "unalignedNucleotideSequences": {
                        "HA": {
                          "compressedSequence": {
                            "bytes": "compressed_data_here"
                          }
                        }
                      }
                    }
                """.trimIndent(),
                )
                stmt.executeUpdate()
            }
        }
    }
//
//    private fun verifyOldDataStructure() {
//        dataSource.connection.use { conn ->
//            val rs = conn.createStatement().executeQuery("""
//                SELECT data FROM sequence_table WHERE id = 'test-seq-1'
//            """)
//
//            assertTrue(rs.next())
//            val data = jacksonObjectMapper().readTree(rs.getString("data"))
//
//            val compressedSeq = data
//                .get("unalignedNucleotideSequences")
//                .get("HA")
//                .get("compressedSequence")
//
//            // Verify dictionaryId does NOT exist yet
//            assertNull(compressedSeq.get("dictionaryId"))
//            assertNotNull(compressedSeq.get("bytes"))
//        }
//    }
//
//    private fun verifyDictTableExists() {
//        dataSource.connection.use { conn ->
//            val rs = conn.createStatement().executeQuery("""
//                SELECT EXISTS (
//                    SELECT FROM information_schema.tables
//                    WHERE table_name = 'dict_table'
//                )
//            """)
//            assertTrue(rs.next())
//            assertTrue(rs.getBoolean(1))
//        }
//    }
//
//    private fun verifyDictTableIsEmpty() {
//        dataSource.connection.use { conn ->
//            val rs = conn.createStatement().executeQuery("""
//                SELECT COUNT(*) FROM dict_table
//            """)
//            assertTrue(rs.next())
//            assertEquals(0, rs.getInt(1))
//        }
//    }
//
//    private fun verifyDictionariesPopulated() {
//        dataSource.connection.use { conn ->
//            val rs = conn.createStatement().executeQuery("""
//                SELECT COUNT(*) FROM dict_table
//            """)
//            assertTrue(rs.next())
//            val count = rs.getInt(1)
//            assertTrue(count > 0, "Expected dictionaries to be populated")
//
//            // Verify specific dictionaries exist
//            val dictRs = conn.createStatement().executeQuery("""
//                SELECT id, hash, dict_contents FROM dict_table
//            """)
//
//            val dicts = mutableListOf<String>()
//            while (dictRs.next()) {
//                dicts.add(dictRs.getString("id"))
//            }
//
//            // Verify expected dictionaries for your organisms
//            assertTrue(dicts.any { it.contains("h5n1_HA") }, "Expected HA dict for h5n1")
//            assertTrue(dicts.any { it.contains("h5n1_unaligned") }, "Expected unaligned dict for h5n1")
//        }
//    }
//
//    private fun verifySequencesHaveDictionaryId() {
//        dataSource.connection.use { conn ->
//            val rs = conn.createStatement().executeQuery("""
//                SELECT data FROM sequence_table WHERE id = 'test-seq-1'
//            """)
//
//            assertTrue(rs.next())
//            val data = jacksonObjectMapper().readTree(rs.getString("data"))
//
//            val compressedSeq = data
//                .get("unalignedNucleotideSequences")
//                .get("HA")
//                .get("compressedSequence")
//
//            // Verify dictionaryId NOW exists
//            assertNotNull(compressedSeq.get("dictionaryId"))
//            assertEquals("h5n1_HA", compressedSeq.get("dictionaryId").asText())
//            assertNotNull(compressedSeq.get("bytes"))
//        }
//    }
//
//    private fun verifyDecompressionWorks() {
//        dataSource.connection.use { conn ->
//            // Get a sequence with dictionaryId
//            val seqRs = conn.createStatement().executeQuery("""
//                SELECT data FROM sequence_table WHERE id = 'test-seq-1'
//            """)
//            assertTrue(seqRs.next())
//            val data = jacksonObjectMapper().readTree(seqRs.getString("data"))
//
//            val dictionaryId = data
//                .get("unalignedNucleotideSequences")
//                .get("HA")
//                .get("compressedSequence")
//                .get("dictionaryId")
//                .asText()
//
//            // Look up the dictionary in dict_table
//            val dictRs = conn.prepareStatement("""
//                SELECT dict_contents FROM dict_table WHERE id = ?
//            """).apply {
//                setString(1, dictionaryId)
//            }.executeQuery()
//
//            assertTrue(dictRs.next(), "Dictionary should be found by ID")
//            assertNotNull(dictRs.getString("dict_contents"))
//        }
//    }
}
