import { type FC } from 'react';
import type { MutationProportionCount } from '../../types/lapis';

type NucSubProps = {
    pos: number;
    mutationTo: string;
    mutationFrom: string;
};

export type AaSub = {
    pos: number;
    mutationTo: string;
    mutationFrom: string;
    gene: string; // TODO: more generally, this might need to be CDS name or even a pair of (gene, CDS)
};

export const NucSubBadge: FC<NucSubProps> = ({ pos, mutationTo, mutationFrom }) => {
    return (
        <button className='border-2 bg-transparent rounded-[3px] font-mono text-xs'>
            <span className='font-mono text-xs overflow-auto'>
                <span className='px-[4px] py-[2px] rounded-s-[3px]' style={{ background: getNucColor(mutationFrom) }}>
                    {mutationFrom}
                </span>
                <span className='px-[4px] py-[2px] bg-gray-200'>{pos + 1}</span>
                <span className='px-[4px] py-[2px] rounded-e-[3px]' style={{ background: getNucColor(mutationTo) }}>
                    {mutationTo}
                </span>
            </span>
        </button>
    );
};

export const AaSubBadge: FC<AaSub> = ({ pos, mutationTo, mutationFrom, gene }) => {
    return (
        <button className='border-2 bg-transparent rounded-[3px] font-mono text-xs'>
            <span className='font-mono text-xs'>
                <span className='px-[4px] py-[2px] rounded-s-[3px]'>{gene}:</span>
                <span className='px-[4px] py-[2px]' style={{ background: getAaColor(mutationFrom) }}>
                    {mutationFrom}
                </span>
                <span className='px-[4px] py-[2px] bg-gray-200'>{pos + 1}</span>
                <span className='px-[4px] py-[2px] rounded-e-[3px]' style={{ background: getAaColor(mutationTo) }}>
                    {mutationTo}
                </span>
            </span>
        </button>
    );
};

export const NUCLEOTIDE_COLORS: Record<string, string> = {
    'A': '#e5e514',
    'C': '#e59c6c',
    'G': '#9ddde5',
    'T': '#b7e525',
    'N': '#555555',
    'R': '#bd8262',
    'K': '#92a364',
    'S': '#61a178',
    'Y': '#5e959e',
    'M': '#897198',
    'W': '#a0a665',
    'B': '#5b9fbd',
    'H': '#949ce1',
    'D': '#d8cda0',
    'V': '#b496b3',
    '-': '#777777',
} as const;

export function getNucColor(nuc: string) {
    return NUCLEOTIDE_COLORS[nuc] ?? NUCLEOTIDE_COLORS.N;
}

// Borrowed from http://ugene.net/forum/YaBB.pl?num=1337064665
export const AMINOACID_COLORS: Record<string, string> = {
    'A': '#e5e575',
    'V': '#e5e57c',
    'L': '#e5e550',
    'I': '#e5e514',
    'B': '#e54c4c',
    'C': '#cee599',
    'D': '#e5774e',
    'E': '#e59c6c',
    'F': '#e2e54d',
    'G': '#e57474',
    'H': '#9ddde5',
    'K': '#b4a2e5',
    'M': '#b7e525',
    'N': '#e57875',
    'P': '#b6b5e5',
    'Q': '#e5aacd',
    'R': '#878fe5',
    'S': '#e583d8',
    'T': '#e5b3cc',
    'W': '#4aa7e5',
    'X': '#aaaaaa',
    'Y': '#57cfe5',
    'Z': '#777777',
    '*': '#777777',
    '-': '#444444',
};

export function getAaColor(aa: string): string {
    return AMINOACID_COLORS[aa] ?? AMINOACID_COLORS.X;
}

export const SubstitutionsContainer = ({ values }: { values: MutationProportionCount[] }) => {
    return values.map(({ mutationFrom, mutationTo, position, sequenceName }) =>
        sequenceName === undefined ? (
            <NucSubBadge mutationFrom={mutationFrom} pos={position} mutationTo={mutationTo} />
        ) : (
            <AaSubBadge gene={sequenceName} mutationFrom={mutationFrom} pos={position} mutationTo={mutationTo} />
        ),
    );
};
