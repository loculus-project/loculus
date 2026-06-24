import { useState } from 'react';

import { BaseDialog } from '../common/BaseDialog';
import { Button } from '../common/Button';

type PublishResponse = {
    version: number;
    previousVersion: number | null;
    publishedAt: string;
    publishedBy: string;
};

interface Props {
    result: PublishResponse;
    organismKey?: string;
    onClose: () => void;
}

export function organismRolloutSnippet(organismKey: string, version: number): string {
    return [
        'helm upgrade <release> ./chart \\',
        `  --reuse-values \\`,
        `  --set organisms.${organismKey}.configVersion=${version}`,
    ].join('\n');
}

export function organismValuesYamlSnippet(organismKey: string, version: number): string {
    return [
        'organisms:',
        `  ${organismKey}:`,
        `    configVersion: ${version}`,
        '',
        '# Some Loculus deployments use defaultOrganisms instead of organisms:',
        '# defaultOrganisms:',
        `#   ${organismKey}:`,
        `#     configVersion: ${version}`,
    ].join('\n');
}

export function PublishModal({ result, organismKey, onClose }: Props) {
    const [copied, setCopied] = useState(false);
    const snippet = organismKey !== undefined ? organismRolloutSnippet(organismKey, result.version) : null;
    const valuesSnippet = organismKey !== undefined ? organismValuesYamlSnippet(organismKey, result.version) : null;
    const isFirstOrganismPublish = organismKey !== undefined && result.previousVersion === null;

    const copy = async () => {
        if (snippet === null) return;
        try {
            await navigator.clipboard.writeText(snippet);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // fall through silently
        }
    };

    return (
        <BaseDialog title={`Published v${result.version}`} isOpen onClose={onClose} fullWidth={false}>
            <div className='max-w-2xl space-y-4'>
                <dl className='text-sm grid grid-cols-2 gap-y-1'>
                    {result.previousVersion !== null && (
                        <>
                            <dt className='text-gray-500'>Previous version</dt>
                            <dd>{result.previousVersion}</dd>
                        </>
                    )}
                    <dt className='text-gray-500'>Published at</dt>
                    <dd className='font-mono text-xs'>{result.publishedAt}</dd>
                    <dt className='text-gray-500'>Published by</dt>
                    <dd>{result.publishedBy}</dd>
                </dl>

                {snippet !== null && valuesSnippet !== null && organismKey !== undefined && (
                    <div className='space-y-3'>
                        <div className='rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950'>
                            <p className='font-medium'>
                                {isFirstOrganismPublish
                                    ? 'This organism is not public until SILO and LAPIS are deployed.'
                                    : 'SILO and LAPIS still need to be rolled out.'}
                            </p>
                            <p>
                                Update the pinned organism config version to{' '}
                                <code className='font-mono'>
                                    organisms.{organismKey}.configVersion={result.version}
                                </code>
                                . The website and backend pick up the published config automatically.
                            </p>
                            {isFirstOrganismPublish && (
                                <p>
                                    After the new organism's LAPIS endpoint is healthy, return to the organism list and
                                    mark it deployed.
                                </p>
                            )}
                        </div>

                        <div>
                            <p className='text-sm font-medium mb-1'>GitOps / ArgoCD values change:</p>
                            <pre className='bg-gray-50 border border-gray-200 rounded p-2 text-xs overflow-x-auto whitespace-pre'>
                                {valuesSnippet}
                            </pre>
                        </div>

                        <div>
                            <p className='text-sm font-medium mb-1'>Direct Helm example:</p>
                            <pre className='bg-gray-50 border border-gray-200 rounded p-2 text-xs overflow-x-auto whitespace-pre'>
                                {snippet}
                            </pre>
                        </div>

                        <p className='text-xs text-gray-600'>
                            Replace <code>&lt;release&gt;</code> and <code>./chart</code> with your deployment's Helm
                            release name and chart path. For Loculus local previews from this repository, the release is
                            usually <code>preview</code> and the chart path is <code>kubernetes/loculus</code>.
                        </p>

                        <a
                            href='https://loculus.org/for-administrators/rolling-out-organism-config/'
                            target='_blank'
                            rel='noreferrer'
                            className='text-xs text-primary-700 underline'
                        >
                            Read the rollout guide
                        </a>
                        <Button
                            type='button'
                            onClick={() => void copy()}
                            className='mt-2 text-xs text-primary-700 hover:underline'
                        >
                            {copied ? 'Copied!' : 'Copy Helm command'}
                        </Button>
                    </div>
                )}

                <div className='flex justify-end'>
                    <Button
                        type='button'
                        onClick={onClose}
                        className='bg-primary-700 hover:bg-primary-800 text-white px-3 py-1.5 rounded text-sm'
                    >
                        OK
                    </Button>
                </div>
            </div>
        </BaseDialog>
    );
}
