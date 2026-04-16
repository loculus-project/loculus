import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import axios from 'axios';

import { crossRefWork, type CrossRefWork } from '../types/seqSetCitation';

export const useCrossRefWork = (doi?: string | null): UseQueryResult<CrossRefWork> => {
    return useQuery({
        queryKey: ['getCrossRefWork', doi],
        queryFn: async () => {
            return axios
                .get(`https://api.crossref.org/works/${doi}/`)
                .then((response) => crossRefWork.parse(response.data));
        },
        enabled: !!doi,
    });
};
