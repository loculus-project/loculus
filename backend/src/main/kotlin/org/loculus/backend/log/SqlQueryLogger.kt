package org.loculus.backend.log

import mu.KotlinLogging
import org.jetbrains.exposed.sql.SqlLogger
import org.jetbrains.exposed.sql.Transaction
import org.jetbrains.exposed.sql.statements.StatementContext
import org.jetbrains.exposed.sql.statements.expandArgs

private val logger = KotlinLogging.logger {}

/**
 * Logs every SQL query executed by Exposed.
 */
class SqlQueryLogger : SqlLogger {
    override fun log(context: StatementContext, transaction: Transaction) {
        logger.info { context.expandArgs(transaction) }
    }
}

