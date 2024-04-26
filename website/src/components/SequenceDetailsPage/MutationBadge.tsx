import { type FC } from 'react';

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
        <span>
            <button className='border-2 bg-transparent rounded-[3px] font-mono text-xs'>
                <span className='font-mono text-xs overflow-auto'>
                    <span
                        className='px-[4px] py-[2px] rounded-s-[3px]'
                        style={{ background: getNucColor(mutationFrom) }}
                    >
                        {mutationFrom}
                    </span>
                    <span className='px-[4px] py-[2px] bg-gray-200'>{pos + 1}</span>
                    <span className='px-[4px] py-[2px] rounded-e-[3px]' style={{ background: getNucColor(mutationTo) }}>
                        {mutationTo}
                    </span>
                </span>
            </button>
            <span>{', '}</span>
        </span>
    );
};

export const AaSubBadge: FC<AaSub> = ({ pos, mutationTo, mutationFrom, gene }) => {
    return (
        <span>
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
            <span>{', '}</span>
        </span>
    );
};

export const NUCLEOTIDE_COLORS: Record<string, string> = {
    'A': '#db8070',
    'C': '#859dfc',
    'G': '#c2b553',
    'T': '#7fbb81',
    'N': '#7b7b7b',
    'R': '#e3c1ae',
    'K': '#c1c9ad',
    'S': '#a9c7b4',
    'Y': '#a5bfc4',
    'M': '#bdbcbe',
    'W': '#c9ccaf',
    'B': '#a6d0e3',
    'H': '#e7e9ff',
    'D': '#fefdfb',
    'V': '#dadada',
    '-': '#9d9d9d',
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
