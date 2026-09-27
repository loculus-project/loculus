package org.loculus.backend.utils

const val CODE_POINTS = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"

fun base34Encode(sequenceNumber: Long, minLength: Int): String {
    val base34Digits: MutableList<Char> = mutableListOf()
    var remainder: Long = sequenceNumber

    do {
        val digit = (remainder % 34).toInt()
        base34Digits.addFirst(CODE_POINTS[digit])
        remainder /= 34
    } while (remainder > 0)

    return base34Digits
        .joinToString("")
        .padStart(minLength, '0')
}
