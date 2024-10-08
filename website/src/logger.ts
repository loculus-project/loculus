import winston, { type Logger } from 'winston';

let _logger: Logger | undefined;

const getLogger = (): Logger => {
    if (_logger === undefined) {
        const logPath = import.meta.env.LOG_DIR;
        const serverLogFile = `${logPath}/website.log`;
        const transports: winston.transport[] = [];

        if (logPath !== undefined) {
            transports.push(new winston.transports.File({ filename: serverLogFile }));
        }

        transports.push(new winston.transports.Console());
        _logger = winston.createLogger({
            level: import.meta.env.LOG_LEVEL ?? 'info',
            format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
            transports,
        });
    }
    return _logger;
};

export type InstanceLogger = ReturnType<typeof getInstanceLogger>;

export const getInstanceLogger = (instance: string) => {
    return {
        // Winston uses npm log levels by default
        error: (message: string) => getLogger().error(message, { instance }),
        warn: (message: string) => getLogger().warn(message, { instance }),
        info: (message: string) => getLogger().info(message, { instance }),
        http: (message: string) => getLogger().http(message, { instance }),
        verbose: (message: string) => getLogger().verbose(message, { instance }),
        debug: (message: string) => getLogger().debug(message, { instance }),
        silly: (message: string) => getLogger().silly(message, { instance }),
    };
};
