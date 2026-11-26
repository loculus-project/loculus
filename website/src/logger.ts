import winston, { type Logger } from 'winston';

let _logger: Logger | undefined;

const getLogger = (): Logger => {
    if (_logger === undefined) {
        // process.env so the values can be overridden at runtime (e.g. via Helm);
        // import.meta.env is inlined from .env at build time and serves as fallback (e.g. for local dev).
        const logPath = process.env.LOG_DIR ?? import.meta.env.LOG_DIR;
        const logLevel = process.env.LOG_LEVEL ?? import.meta.env.LOG_LEVEL ?? 'info';
        const serverLogFile = `${logPath}/website.log`;
        const transports: winston.transport[] = [];

        if (logPath !== undefined) {
            transports.push(new winston.transports.File({ filename: serverLogFile }));
        }

        transports.push(new winston.transports.Console());
        _logger = winston.createLogger({
            level: logLevel,
            format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
            transports,
        });
    }
    return _logger;
};

/** Structured fields that are written next to the message in the JSON log line. Never put tokens or cookies here. */
export type LogMetadata = Record<string, unknown>;

export type InstanceLogger = ReturnType<typeof getInstanceLogger>;

export const getInstanceLogger = (instance: string) => {
    return {
        // Winston uses npm log levels by default
        error: (message: string, metadata?: LogMetadata) => getLogger().error(message, { ...metadata, instance }),
        warn: (message: string, metadata?: LogMetadata) => getLogger().warn(message, { ...metadata, instance }),
        info: (message: string, metadata?: LogMetadata) => getLogger().info(message, { ...metadata, instance }),
        http: (message: string, metadata?: LogMetadata) => getLogger().http(message, { ...metadata, instance }),
        verbose: (message: string, metadata?: LogMetadata) => getLogger().verbose(message, { ...metadata, instance }),
        debug: (message: string, metadata?: LogMetadata) => getLogger().debug(message, { ...metadata, instance }),
        silly: (message: string, metadata?: LogMetadata) => getLogger().silly(message, { ...metadata, instance }),
    };
};
