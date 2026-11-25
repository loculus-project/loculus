import winston, { type Logger } from 'winston';

let _logger: Logger | undefined;

// Read from process.env first so the values can be set on the running container (e.g. via Helm) without a rebuild.
// import.meta.env is kept as a fallback for values from .env files during local development.
const readEnv = (name: 'LOG_DIR' | 'LOG_LEVEL'): string | undefined =>
    (typeof process !== 'undefined' ? process.env[name] : undefined) ?? (import.meta.env[name] as string | undefined);

const getLogger = (): Logger => {
    if (_logger === undefined) {
        const logPath = readEnv('LOG_DIR');
        const serverLogFile = `${logPath}/website.log`;
        const transports: winston.transport[] = [];

        if (logPath !== undefined) {
            transports.push(new winston.transports.File({ filename: serverLogFile }));
        }

        transports.push(new winston.transports.Console());
        _logger = winston.createLogger({
            level: readEnv('LOG_LEVEL') ?? 'info',
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
