package org.loculus.backend.service

import org.loculus.backend.config.BackendConfig
import org.loculus.backend.utils.Accession
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.stereotype.Service

@Service
class GenerateAccessionFromNumberService(@Autowired val backendConfig: BackendConfig) {

    fun generateCustomId(sequenceNumber: Long): String {
        val base34Digits: MutableList<Char> = mutableListOf()
        var remainder: Long = sequenceNumber

        do {
            val digit = (remainder % 34).toInt()
            base34Digits.addFirst(CODE_POINTS[digit])
            remainder /= 34
        } while (remainder > 0)

        val serialAccessionPart = base34Digits
            .joinToString("")
            .padStart(6, '0')
        return backendConfig.accessionPrefix + serialAccessionPart + generateCheckCharacter(serialAccessionPart)
    }

    fun validateAccession(accession: Accession): Boolean {
        if (!accession.startsWith(backendConfig.accessionPrefix)) {
            return false
        }
        return validateCheckCharacter(accession.removePrefix(backendConfig.accessionPrefix))
    }

    // See https://en.wikipedia.org/wiki/Luhn_mod_N_algorithm for details
    private fun generateCheckCharacter(input: String): Char {
        var factor = 2
        var sum = 0

        for (i in input.length - 1 downTo 0) {
            var addend = factor * getCodePointFromCharacter(input[i])

            factor = if (factor == 2) 1 else 2

            addend = addend / NUMBER_OF_VALID_CHARACTERS + addend % NUMBER_OF_VALID_CHARACTERS
            sum += addend
        }

        val remainder = sum % NUMBER_OF_VALID_CHARACTERS
        val checkCodePoint = (NUMBER_OF_VALID_CHARACTERS - remainder) % NUMBER_OF_VALID_CHARACTERS
        return CODE_POINTS[checkCodePoint]
    }

    private fun validateCheckCharacter(input: String): Boolean {
        var factor = 1
        var sum = 0

        for (i in input.length - 1 downTo 0) {
            val codePoint: Int = getCodePointFromCharacter(input[i])
            var addend = factor * codePoint

            factor = when (factor) {
                2 -> 1
                else -> 2
            }

            addend = addend / NUMBER_OF_VALID_CHARACTERS + addend % NUMBER_OF_VALID_CHARACTERS
            sum += addend
        }
        val remainder = sum % NUMBER_OF_VALID_CHARACTERS
        return remainder == 0
    }

    companion object {
        const val CODE_POINTS = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"
        fun getCodePointFromCharacter(character: Char): Int = CODE_POINTS.indexOf(character)
        const val NUMBER_OF_VALID_CHARACTERS = CODE_POINTS.length
    }
}
