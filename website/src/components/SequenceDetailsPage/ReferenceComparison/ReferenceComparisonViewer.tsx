import Gensplore from 'gensplore';

import type { ReferenceComparisonData } from './types';

export default function ReferenceComparisonViewer({
    genbankString,
    alignedSequence,
    annotationNotice,
}: ReferenceComparisonData) {
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
