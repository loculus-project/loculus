package org.loculus.backend.service

import org.loculus.backend.config.BackendConfig
import org.loculus.backend.utils.Accession
import org.loculus.backend.utils.base34Encode
import org.loculus.backend.utils.generateCheckCharacter
import org.loculus.backend.utils.validateCheckCharacter
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.stereotype.Service

@Service
class GenerateAccessionFromNumberService(@Autowired val backendConfig: BackendConfig) {

    fun generateCustomId(sequenceNumber: Long): String {
        val serialAccessionPart = base34Encode(sequenceNumber, 6)
        return backendConfig.accessionPrefix + serialAccessionPart + generateCheckCharacter(serialAccessionPart)
    }

    fun validateAccession(accession: Accession): Boolean {
        if (!accession.startsWith(backendConfig.accessionPrefix)) {
            return false
        }
        return validateCheckCharacter(accession.removePrefix(backendConfig.accessionPrefix))
    }
}
