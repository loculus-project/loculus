import { getConfig } from '../../../../config';
import { logger } from '../../../../logger';

type PangoLineage = string;

export type SequenceReview = {
    sequenceId: number;
    errors: ProcessingAnnotation[];
    warnings: ProcessingAnnotation[];
    data: {
        metadata: {
            date: string;
            host: string;
            region: string;
            country: string;
            division: string;
            pangoLineage: PangoLineage;
        };
        unalignedNucleotideSequences: {
            main: string;
        };
    };
};

export type ProcessingAnnotation = {
    source: {
        fieldName: string;
        type: string;
    };
    message: string;
};

export const getReviewData = async (name: string): Promise<SequenceReview[]> => {
    try {
        const config = getConfig();
        const mySequencesQuery = `${config.backendUrl}/get-data-to-review?submitter=${name}&numberOfSequences=1000`;

        const mySequencesResponse = await fetch(mySequencesQuery, {
            method: 'GET',
            headers: {
                accept: 'application/x-ndjson',
            },
        });

        if (!mySequencesResponse.ok) {
            logger.error(`Failed to fetch user sequences with status ${mySequencesResponse.status}`);
            return [];
        }

        const sequenceReviews: SequenceReview[] = [];

        const ndjsonText = await mySequencesResponse.text();
        const ndjsonLines = ndjsonText.split('\n');

        ndjsonLines.forEach((line: string) => {
            if (line.trim() === '') {
                return;
            }

            try {
                const sequenceReview = JSON.parse(line) as SequenceReview;
                sequenceReviews.push(sequenceReview);
            } catch (error) {
                logger.error(`Failed to parse JSON line: ${error}`);
            }
        });

        return sequenceReviews;
    } catch (error) {
        logger.error(`Failed to fetch user sequences with error '${(error as Error).message}'`);
        return [];
    }
};
