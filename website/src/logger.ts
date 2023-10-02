import winston, { type Logger } from 'winston';

const logPath = import.meta.env.LOG_DIR;
const serverLogFile = `${logPath}/website.log`;

let _logger: Logger | undefined;

const getLogger = (): Logger => {
    if (_logger === undefined) {
        const transports: winston.transport[] = [];

        if (logPath !== undefined) {
            transports.push(new winston.transports.File({ filename: serverLogFile }));
        }

        if (import.meta.env.NODE_ENV !== 'production') {
            transports.push(new winston.transports.Console());
        }
        _logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports,
        });
    }
    return _logger;
};

export const logger = getLogger();
