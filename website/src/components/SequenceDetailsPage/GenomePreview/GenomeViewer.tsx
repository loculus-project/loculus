import Gensplore from 'gensplore';

import type { GenomePreviewData } from './types';

export default function GenomeViewer({ genbankString, alignedSequence, annotationNotice }: GenomePreviewData) {
    return (
        <>
            {annotationNotice !== undefined && (
                <p style={{ margin: '12px 20px', fontFamily: 'sans-serif', fontSize: 14 }} role='status'>
                    {annotationNotice}
                </p>
            )}
            <Gensplore genbankString={genbankString} alignedSequence={alignedSequence} />
        </>
    );
}
