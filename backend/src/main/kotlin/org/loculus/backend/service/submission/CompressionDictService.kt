package org.loculus.backend.service.submission

import org.jetbrains.exposed.sql.transactions.transaction
import org.loculus.backend.api.Organism
import org.loculus.backend.config.BackendConfig
import org.loculus.backend.service.submission.dbtables.CompressionDictionariesTable
import org.loculus.backend.service.submission.dbtables.CompressionDictionaryEntity
import org.springframework.stereotype.Service
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

class DictEntry(val id: Int, val dict: ByteArray)

/**
 * An abstraction over the compression_dictionaries_table.
 * Caches the contents in memory to avoid repeated DB lookups.
 */
@Service
class CompressionDictService(private val backendConfig: BackendConfig) {
    private val caches: Triple<
        Map<Pair<String, String>, DictEntry>,
        Map<String, DictEntry>,
        ConcurrentHashMap<Int, ByteArray>,
        > by lazy {
        // Must be lazy to make sure the caches are only populated after the Flyway migration has run
        // The Spring bean is created before Flyway runs, i.e. we must not read from the DB when creating this class
        populateCaches()
    }

    private val dictCache: Map<Pair<String, String>, DictEntry> get() = caches.first
    private val unalignedDictCache: Map<String, DictEntry> get() = caches.second
    private val cacheById: ConcurrentHashMap<Int, ByteArray> get() = caches.third

    private fun populateCaches(): Triple<
        Map<Pair<String, String>, DictEntry>,
        Map<String, DictEntry>,
        ConcurrentHashMap<Int, ByteArray>,
        > {
        val dictCache = mutableMapOf<Pair<String, String>, DictEntry>()
        val unalignedDictCache = mutableMapOf<String, DictEntry>()
        val cacheById = ConcurrentHashMap<Int, ByteArray>()

        transaction {
            backendConfig.organisms.forEach { (organism, instanceConfig) ->
                val segmentsAndGenes =
                    instanceConfig.referenceGenome.nucleotideSequences + instanceConfig.referenceGenome.genes
                for (referenceSequence in segmentsAndGenes) {
                    val reference = referenceSequence.sequence
                    val dictId = getDictIdOrInsertNewEntry(reference)

                    val dict = reference.toByteArray()

                    dictCache[Pair(organism, referenceSequence.name)] = DictEntry(dictId, dict)
                    cacheById[dictId] = dict
                }

                val references = instanceConfig.referenceGenome.nucleotideSequences
                    .joinToString("") { it.sequence }
                val dictId = getDictIdOrInsertNewEntry(references)
                val unalignedDict = references.toByteArray()
                val dictEntry = DictEntry(dictId, unalignedDict)

                unalignedDictCache[organism] = dictEntry
                cacheById[dictId] = unalignedDict
            }
        }

        return Triple(dictCache.toMap(), unalignedDictCache.toMap(), cacheById)
    }

    /**
     * Get dictionary for a specific segment or gene (used when compressing processed sequences)
     */
    fun getDictForSegmentOrGene(organism: Organism, segmentOrGene: String): DictEntry? =
        dictCache[Pair(organism.name, segmentOrGene)]

    /**
     * Get dictionary for unaligned sequences (used when compressing submitted sequences)
     */
    fun getDictForUnalignedSequence(organism: Organism): DictEntry? = unalignedDictCache[organism.name]

    /**
     * Get dictionary by ID (used when decompressing sequences)
     */
    fun getDictById(id: Int): ByteArray {
        val cachedDict = cacheById[id]
        if (cachedDict != null) {
            return cachedDict
        }

        return transaction {
            val dict = CompressionDictionaryEntity.findById(id)
                ?.dictContents
                ?.toByteArray()
                ?: throw RuntimeException("Did not find compression dictionary with id $id")
            cacheById[id] = dict
            dict
        }
    }

    private fun getDictIdOrInsertNewEntry(dict: String): Int {
        val hash = hash(dict)

        val existingId = CompressionDictionaryEntity.find { CompressionDictionariesTable.hashColumn eq hash }
            .firstOrNull()
            ?.id
            ?.value

        if (existingId != null) {
            return existingId
        }

        return CompressionDictionaryEntity
            .new {
                this.hash = hash
                this.dictContents = dict
            }
            .id
            .value
    }

    private fun hash(input: String): String {
        val hashFunction = MessageDigest.getInstance("SHA-256")
        val digest = hashFunction.digest(input.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }
}
