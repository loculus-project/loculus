package org.loculus.backend.utils

/**
 * Postgres cannot store the NUL character (U+0000) in `text`/`varchar` columns, nor inside `jsonb`.
 * Any user input that ends up in the database must therefore be checked for it, so that we can return a
 * helpful 422 instead of failing with an internal server error on insert.
 */
const val NUL_CHARACTER = '\u0000'

private const val NUL_PLACEHOLDER = "<NUL>"

fun String.containsNulCharacter(): Boolean = contains(NUL_CHARACTER)

/** Makes NUL characters visible (and safe to include) in error messages. */
fun String.withVisibleNulCharacters(): String = replace(NUL_CHARACTER.toString(), NUL_PLACEHOLDER)

/**
 * Prepares user input for inclusion in an error message: makes NUL characters visible and truncates it.
 * The input may be the content of a whole binary file, so it must not be echoed in full
 * (it would end up in the response and in the logs).
 */
fun String.forErrorMessage(max: Int = 100): String = if (length > max) {
    take(max).withVisibleNulCharacters() + "..."
} else {
    withVisibleNulCharacters()
}
