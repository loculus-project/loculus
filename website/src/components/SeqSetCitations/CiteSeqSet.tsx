import { type FC, useState } from 'react';
import { toast } from 'react-toastify';

import { type CitationFormat, citationFormats, getCitation } from './citationFormats';
import type { SeqSet } from '../../types/seqSetCitation';
import { BoxWithTabsBox, BoxWithTabsTab, BoxWithTabsTabBar } from '../common/BoxWithTabs';
import { Button } from '../common/Button';

type CiteSeqSetProps = {
    seqSet: SeqSet;
    databaseName: string;
    /** Absolute URL of this SeqSet page, used when the SeqSet has no DOI yet. */
    seqSetUrl: string;
};

export const CiteSeqSet: FC<CiteSeqSetProps> = ({ seqSet, databaseName, seqSetUrl }) => {
    const [selectedFormat, setSelectedFormat] = useState<CitationFormat>('apa');

    const citation = getCitation(selectedFormat, { seqSet, databaseName, seqSetUrl });

    const copyToClipboard = async () => {
        await navigator.clipboard.writeText(citation);
        toast.success('Copied to clipboard', {
            position: 'bottom-center',
            autoClose: 2000,
        });
    };

    return (
        <div>
            <BoxWithTabsTabBar>
                {citationFormats.map(({ id, label }) => (
                    <BoxWithTabsTab
                        key={id}
                        label={label}
                        isActive={selectedFormat === id}
                        onClick={() => setSelectedFormat(id)}
                    />
                ))}
            </BoxWithTabsTabBar>
            <BoxWithTabsBox>
                <pre
                    data-testid='citation-text'
                    className='whitespace-pre-wrap break-words font-mono text-sm text-gray-900'
                >
                    {citation}
                </pre>
                <Button variant='outline' className='mt-4' onClick={() => void copyToClipboard()}>
                    Copy to clipboard
                </Button>
            </BoxWithTabsBox>
        </div>
    );
};
