import type { FC } from 'react';

import type { CurrentPipelineVersions, PipelineVersionStatistics } from '../../types/backend';

interface Props {
    statistics: PipelineVersionStatistics;
    currentVersions: CurrentPipelineVersions | undefined;
}

export const PipelineStatisticsTable: FC<Props> = ({ statistics, currentVersions }) => {
    const versions = Array.from(
        new Set(Object.values(statistics).flatMap((m) => Object.keys(m).map((v) => Number(v)))),
    ).sort((a, b) => a - b);

    return (
        <table className='table-auto border-collapse border border-gray-200 mt-4'>
            <thead>
                <tr>
                    <th className='border px-2 py-1'>Organism</th>
                    {versions.map((v) => (
                        <th key={v} className='border px-2 py-1'>
                            {v}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {Object.entries(statistics).map(([organism, versionMap]) => {
                    const currentVersion = currentVersions?.[organism];
                    return (
                        <tr key={organism}>
                            <td className='border px-2 py-1 font-semibold'>{organism}</td>
                            {versions.map((v) => (
                                <td
                                    key={v}
                                    className={`border px-2 py-1 text-right${currentVersion === v ? ' font-bold' : ''}`}
                                >
                                    {versionMap[v]}
                                </td>
                            ))}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
