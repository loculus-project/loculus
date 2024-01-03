package org.loculus.backend.utils

import org.loculus.backend.api.AccessionVersionInterface

typealias Accession = String
typealias Version = Long

object AccessionComparator : Comparator<Accession> {
    override fun compare(left: Accession, right: Accession): Int {
        return left.toInt().compareTo(right.toInt())
    }
}

object AccessionVersionComparator : Comparator<AccessionVersionInterface> {
    override fun compare(left: AccessionVersionInterface, right: AccessionVersionInterface): Int {
        return when (val accessionResult = left.accession.toInt().compareTo(right.accession.toInt())) {
            0 -> left.version.compareTo(right.version)
            else -> accessionResult
        }
    }
}
