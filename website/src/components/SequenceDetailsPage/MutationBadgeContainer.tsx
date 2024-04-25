import { NucSubBadge, AaSubBadge } from './MutationBadge';
import type { MutationProportionCount } from '../../types/lapis';

export const NucSeqContainer = ({ values }: { values: MutationProportionCount[] }) => {
    return values.map(({ mutationFrom, mutationTo, position, sequenceName }) =>
        sequenceName === undefined ? (
            <NucSubBadge
                className=''
                sub={{
                    ref: mutationFrom,
                    pos: position,
                    qry: mutationTo,
                }}
            />
        ) : (
            <AaSubBadge
                className=''
                sub={{
                    gene: sequenceName,
                    ref: mutationFrom,
                    pos: position,
                    qry: mutationTo,
                }}
            />
        ),
    );
};
