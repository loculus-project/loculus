export type Log = {
    level: string;
    message: string;
    instance?: string;
};

export type ClientLogger = {
    log: (log: Log) => Promise<Response>;
    error: (message: string) => Promise<Response>;
    info: (message: string) => Promise<Response>;
};

export const getClientLogger = (instance: string = 'client'): ClientLogger => {
    const clientLogger = {
        log: async ({ message, level, instance }: Log): Promise<Response> =>
            fetch('/admin/logs.txt', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ level, message, instance }),
            }),
        error: async (message: string): Promise<Response> => clientLogger.log({ level: 'error', instance, message }),
        info: async (message: string) => clientLogger.log({ level: 'info', instance, message }),
    };
    return clientLogger;
};
