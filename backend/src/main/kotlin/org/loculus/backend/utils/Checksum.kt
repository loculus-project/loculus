package org.loculus.backend.utils

// See https://en.wikipedia.org/wiki/Luhn_mod_N_algorithm for details
fun generateCheckCharacter(input: String): Char {
    var factor = 2
    var sum = 0

    for (i in input.length - 1 downTo 0) {
        var addend = factor * getCodePointFromCharacter(input[i])

        factor = if (factor == 2) 1 else 2

        addend = addend / CODE_POINTS.length + addend % CODE_POINTS.length
        sum += addend
    }

    val remainder = sum % CODE_POINTS.length
    val checkCodePoint = (CODE_POINTS.length - remainder) % CODE_POINTS.length
    return CODE_POINTS[checkCodePoint]
}

fun validateCheckCharacter(input: String): Boolean {
    if (input.isEmpty() || input.any { it !in CODE_POINTS }) {
        return false
    }
    return generateCheckCharacter(input.dropLast(1)) == input.last()
}

private fun getCodePointFromCharacter(character: Char): Int = CODE_POINTS.indexOf(character)
