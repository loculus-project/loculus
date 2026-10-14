package org.loculus.backend.utils

import org.loculus.backend.api.AccessionVersionInterface

typealias Accession = String
typealias Version = Long

object AccessionComparator : Comparator<Accession> {
    override fun compare(left: Accession, right: Accession): Int = left.compareTo(right)
}

object AccessionVersionComparator : Comparator<AccessionVersionInterface> {
    override fun compare(left: AccessionVersionInterface, right: AccessionVersionInterface): Int =
        when (val accessionResult = left.accession.compareTo(right.accession)) {
            0 -> left.version.compareTo(right.version)
            else -> accessionResult
        }
}
