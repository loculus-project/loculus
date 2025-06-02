import { FC, useEffect, useState } from 'react';

import { createBackendClient } from '../../services/backendClientFactory';
import type { PipelineVersionStats } from '../../types/backend';

interface Props {
    accessToken: string;
}

const DevDashboard: FC<Props> = ({ accessToken }) => {
    const [stats, setStats] = useState<PipelineVersionStats | null>(null);

    useEffect(() => {
        void createBackendClient()
            .getPipelineVersionStats(accessToken)
            .then((result) =>
                result.match(
                    (data) => setStats(data),
                    () => setStats({}),
                ),
            );
    }, [accessToken]);

    if (stats === null) {
        return <p>Loading...</p>;
    }

    return (
        <div className='space-y-4'>
            {Object.entries(stats).map(([organism, versions]) => (
                <div key={organism} className='border p-2'>
                    <h2 className='font-semibold'>{organism}</h2>
                    <table className='table-auto'>
                        <thead>
                            <tr>
                                <th className='px-2'>Pipeline Version</th>
                                <th className='px-2'>Count</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(versions).map(([version, count]) => (
                                <tr key={version}>
                                    <td className='px-2'>{version}</td>
                                    <td className='px-2'>{count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
};

export default DevDashboard;
