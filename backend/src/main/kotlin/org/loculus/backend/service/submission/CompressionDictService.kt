package org.loculus.backend.service.submission

import mu.KotlinLogging
import org.jetbrains.exposed.sql.transactions.transaction
import org.loculus.backend.api.Organism
import org.loculus.backend.config.OrganismConfig
import org.loculus.backend.config.ReferenceSequence
import org.loculus.backend.config.service.ConfigService
import org.loculus.backend.service.submission.dbtables.CompressionDictionariesTable
import org.loculus.backend.service.submission.dbtables.CompressionDictionaryEntity
import org.loculus.backend.utils.DateProvider
import org.springframework.stereotype.Service
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

private val log = KotlinLogging.logger { }

class DictEntry(val id: Int, val dict: ByteArray)

/**
 * An abstraction over the compression_dictionaries_table.
 * Caches the contents in memory to avoid repeated DB lookups.
 */
@Service
class CompressionDictService(private val configService: ConfigService, private val dateProvider: DateProvider) {
    private data class DictKey(
        val organism: Organism,
        val organismVersion: Long,
        val segmentOrGene: String,
        val referenceHash: String,
    )
    private data class UnalignedDictKey(val organism: Organism, val organismVersion: Long, val referenceHash: String)

    private val byOrganismAndName = ConcurrentHashMap<DictKey, DictEntry>()
    private val unalignedByOrganism = ConcurrentHashMap<UnalignedDictKey, DictEntry>()
    private val dictsById = ConcurrentHashMap<Int, ByteArray>()

    @Volatile
    private var cachesPopulated = false

    /**
     * Main responsibility: Make sure that all dictionaries that might be used for new data exist in the database.
     *
     * Also, already populates the caches.
     */
    private fun populateCachesIfNeeded() {
        if (cachesPopulated) {
            return
        }
        synchronized(this) {
            if (cachesPopulated) {
                return
            }
            populateCaches()
            cachesPopulated = true
        }
    }

    private fun populateCaches() {
        log.info { "Populating compression dictionary caches" }

        transaction {
            configService.listReleasedOrganisms().forEach { listing ->
                val organism = Organism(listing.key)
                val versionedOrganism = configService.getOrganismConfig(listing.key)
                cacheDictionaries(organism, versionedOrganism.version, versionedOrganism.config)
            }
        }

        log.info {
            "Populated compression dictionary caches: ${byOrganismAndName.size} byOrganismAndName, " +
                "${unalignedByOrganism.size} unalignedByOrganism, ${dictsById.size} dictsById"
        }
    }

    fun getDictForSegmentOrGene(organism: Organism, segmentOrGene: String): DictEntry? {
        val versionedOrganism = configService.getOrganismConfig(organism)
        val reference = versionedOrganism.config.referenceGenome.nucleotideSequences
            .plus(versionedOrganism.config.referenceGenome.genes)
            .find { it.name == segmentOrGene }
            ?: return null
        val key = DictKey(organism, versionedOrganism.version, segmentOrGene, computeHash(reference.sequence))
        byOrganismAndName[key]?.let { return it }

        populateCachesIfNeeded()
        byOrganismAndName[key]?.let { return it }

        return transaction { cacheReference(organism, versionedOrganism.version, reference) }
    }

    fun getDictForUnalignedSequence(organism: Organism): DictEntry? {
        val versionedOrganism = configService.getOrganismConfig(organism)
        if (versionedOrganism.config.referenceGenome.nucleotideSequences.isEmpty()) {
            return null
        }
        val concatenatedNucleotideSequences = concatenateNucleotideSequences(versionedOrganism.config)
        val key = UnalignedDictKey(organism, versionedOrganism.version, computeHash(concatenatedNucleotideSequences))
        unalignedByOrganism[key]?.let { return it }

        populateCachesIfNeeded()
        unalignedByOrganism[key]?.let { return it }

        return transaction {
            cacheUnalignedDictionary(organism, versionedOrganism.version, concatenatedNucleotideSequences)
        }
    }

    /**
     * Get dictionary by ID (used when decompressing sequences)
     */
    fun getDictById(id: Int): ByteArray {
        val cachedDict = dictsById[id]
        if (cachedDict != null) {
            return cachedDict
        }

        return transaction {
            val dict = CompressionDictionaryEntity.findById(id)
                ?.dictContents
                ?: throw RuntimeException("Did not find compression dictionary with id $id")
            dictsById[id] = dict
            dict
        }
    }

    private fun cacheDictionaries(organism: Organism, organismVersion: Long, organismConfig: OrganismConfig) {
        val nucleotideSequences = organismConfig.referenceGenome.nucleotideSequences
        val genes = organismConfig.referenceGenome.genes
        for (referenceSequence in nucleotideSequences + genes) {
            cacheReference(organism, organismVersion, referenceSequence)
        }

        if (nucleotideSequences.isNotEmpty()) {
            cacheUnalignedDictionary(organism, organismVersion, concatenateNucleotideSequences(organismConfig))
        }
    }

    private fun cacheReference(
        organism: Organism,
        organismVersion: Long,
        referenceSequence: ReferenceSequence,
    ): DictEntry {
        val reference = referenceSequence.sequence
        val dictId = getDictIdOrInsertNewEntry(reference, "${organism.name} - ${referenceSequence.name}")
        val dict = reference.toByteArray()
        val dictEntry = DictEntry(dictId, dict)
        byOrganismAndName[
            DictKey(organism, organismVersion, referenceSequence.name, computeHash(reference)),
        ] = dictEntry
        dictsById[dictId] = dict
        return dictEntry
    }

    private fun cacheUnalignedDictionary(
        organism: Organism,
        organismVersion: Long,
        concatenatedNucleotideSequences: String,
    ): DictEntry {
        val dictId = getDictIdOrInsertNewEntry(
            concatenatedNucleotideSequences,
            "${organism.name} - concatenated nucleotide sequences",
        )
        val dict = concatenatedNucleotideSequences.toByteArray()
        val dictEntry = DictEntry(dictId, dict)
        unalignedByOrganism[
            UnalignedDictKey(organism, organismVersion, computeHash(concatenatedNucleotideSequences)),
        ] = dictEntry
        dictsById[dictId] = dict
        return dictEntry
    }

    private fun concatenateNucleotideSequences(organismConfig: OrganismConfig): String =
        organismConfig.referenceGenome.nucleotideSequences
            .map { it.sequence }
            .sortedBy { it }
            .joinToString("")

    private fun getDictIdOrInsertNewEntry(dict: String, description: String): Int {
        val hash = computeHash(dict)

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
                this.dictContents = dict.toByteArray()
                this.description = description
                this.createdAt = dateProvider.getCurrentDateTime()
            }
            .also {
                log.debug {
                    "Inserted new dict entry: id ${it.id.value}, $description, for dict ${dict.take(11)}..."
                }
            }
            .id
            .value
    }

    private fun computeHash(input: String): String {
        val hashFunction = MessageDigest.getInstance("SHA-256")
        val digest = hashFunction.digest(input.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }
}
