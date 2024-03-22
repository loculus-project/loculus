import classNames from 'classnames';
import { getContrast } from 'polished';
import { type CSSProperties, useMemo } from 'react';

import { colorHash } from '../../utils/colorHash';

export interface NucSub {
    pos: number;
    qry: string;
    ref: string;
}

export interface AaSub extends NucSub {
    gene: string; // TODO: more generally, this might need to be CDS name or even a pair of (gene, CDS)
}

export const NucSubBadge = ({ sub, className, ...rest }: { sub: NucSub; className?: string }) => {
    const { ref, pos, qry } = sub;

    const style = useMemo(() => {
        const refBg = getNucColor(ref);
        const qryBg = getNucColor(qry);

        return {
            ref: {
                color: selectTextColor(refBg),
                background: refBg,
            },
            qry: {
                color: selectTextColor(qryBg),
                background: qryBg,
            },
        } satisfies Record<string, CSSProperties>;
    }, [qry, ref]);

    return (
        <span className={classNames('font-mono text-xs', className)} {...rest}>
            <span className="px-[4px] py-[2px] rounded-s-[3px]" style={style.ref}>
                {ref}
            </span>
            <span className="px-[4px] py-[2px] bg-gray-200">{pos + 1}</span>
            <span className="px-[4px] py-[2px] rounded-e-[3px]" style={style.qry}>
                {qry}
            </span>
        </span>
    );
};

export const AaSubBadge = ({ sub, className, ...rest }: { sub: AaSub; className?: string }) => {
    const { gene, ref, pos, qry } = sub;

    const style = useMemo(() => {
        const geneBg = colorHash(gene, { lightness: 0.33, saturation: 0.5 });
        const refBg = getNucColor(ref);
        const qryBg = getAaColor(qry);
        return {
            gene: {
                color: selectTextColor(geneBg),
                background: geneBg,
            },
            ref: {
                color: selectTextColor(refBg),
                background: refBg,
            },
            qry: {
                color: selectTextColor(qryBg),
                background: qryBg,
            },
        } satisfies Record<string, CSSProperties>;
    }, [gene, qry, ref]);

    return (
        <span className={classNames('font-mono text-xs', className)} {...rest}>
            <span className="px-[4px] py-[2px] rounded-s-[3px]" style={style.gene}>
                {gene}:
            </span>
            <span className="px-[4px] py-[2px]" style={style.ref}>
                {ref}
            </span>
            <span className="px-[4px] py-[2px] bg-gray-200">{pos + 1}</span>
            <span className="px-[4px] py-[2px] rounded-e-[3px]" style={style.qry}>
                {qry}
            </span>
        </span>
    );
};

export const NUCLEOTIDE_COLORS: Record<string, string> = {
    'A': '#b54330',
    'C': '#3c5bd6',
    'G': '#9c8d1c',
    'T': '#409543',
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

export function selectTextColor(backgroundColor: string) {
    const contrast = getContrast(backgroundColor, '#ddd');
    if (contrast > 2.7) {
        return '#ddd';
    }
    return '#000';
}
