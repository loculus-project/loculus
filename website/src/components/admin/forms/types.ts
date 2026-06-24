import type { OperationRequest, OrganismDraftResponse } from '../../../types/loculusConfig';

export interface OrganismFormProps {
    draft: OrganismDraftResponse;
    busy: boolean;
    postOp: (op: OperationRequest) => Promise<boolean>;
}
