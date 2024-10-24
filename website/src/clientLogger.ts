import axios from 'axios';

export type Log = {
    level: string;
    message: string;
    instance?: string;
};

export type ClientLogger = {
    log: (log: Log) => Promise<Response>;
    error: (message: string) => Promise<Response>;
    warn: (message: string) => Promise<Response>;
    info: (message: string) => Promise<Response>;
};

export const getClientLogger = (instance: string = 'client'): ClientLogger => {
    const clientLogger = {
        log: async (log: Log): Promise<Response> => axios.post('/admin/logs.txt', log),
        error: async (message: string): Promise<Response> => clientLogger.log({ level: 'error', instance, message }),
        warn: async (message: string): Promise<Response> => clientLogger.log({ level: 'warn', instance, message }),
        info: async (message: string): Promise<Response> => clientLogger.log({ level: 'info', instance, message }),
    };
    return clientLogger;
};
