import { enaDepositionApi } from './enaDepositionApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
import { getInstanceLogger } from '../logger.ts';
import type { SubmitItem } from '../types/enaDeposition.ts';
import type { InstanceLogger } from '../logger.ts';

// Create a browser-safe logger that only uses server-side logging when available
const createClientSafeLogger = (): InstanceLogger => {
    // Check if we're running in the browser
    if (typeof window !== 'undefined') {
        // Browser environment - use console logging
        return {
            error: (message: string) => console.error(`[EnaDepositionClient] ${message}`),
            warn: (message: string) => console.warn(`[EnaDepositionClient] ${message}`),
            info: (message: string) => console.info(`[EnaDepositionClient] ${message}`),
            http: (message: string) => console.log(`[EnaDepositionClient] ${message}`),
            verbose: (message: string) => console.log(`[EnaDepositionClient] ${message}`),
            debug: (message: string) => console.debug(`[EnaDepositionClient] ${message}`),
            silly: (message: string) => console.debug(`[EnaDepositionClient] ${message}`),
        };
    }
    // Server environment - use winston
    return getInstanceLogger('EnaDepositionClient');
};

const instanceLogger = createClientSafeLogger();

export class EnaDepositionClient extends ZodiosWrapperClient<typeof enaDepositionApi> {
    public static create(enaDepositionUrl: string, logger = instanceLogger) {
        return new EnaDepositionClient(
            enaDepositionUrl,
            enaDepositionApi,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            (axiosError) => axiosError.data,
            logger,
            'ena-deposition',
        );
    }

    public health() {
        return this.call('health', {});
    }

    public getSubmissions(params?: {
        status?: string;
        organism?: string;
        group_id?: number;
        page?: number;
        size?: number;
    }) {
        return this.call('getSubmissions', { queries: params ?? {} });
    }

    public getSubmissionDetail(accession: string, version: number) {
        return this.call('getSubmissionDetail', { params: { accession, version: version.toString() } });
    }

    public generatePreview(accessions: string[]) {
        return this.call('generatePreview', { accessions }, {});
    }

    public submitToEna(submissions: SubmitItem[]) {
        return this.call('submitToEna', { submissions }, {});
    }

    public getErrors(params?: {
        table?: string;
        organism?: string;
        group_id?: number;
        page?: number;
        size?: number;
    }) {
        return this.call('getErrors', { queries: params ?? {} });
    }

    public getErrorDetail(accession: string, version: number) {
        return this.call('getErrorDetail', { params: { accession, version: version.toString() } });
    }

    public retrySubmission(accession: string, version: number, editedMetadata?: Record<string, unknown>) {
        return this.call(
            'retrySubmission',
            editedMetadata ? { edited_metadata: editedMetadata } : {},
            { params: { accession, version: version.toString() } },
        );
    }
}
