import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useEffect, useState, type FC } from 'react';
import type { PipelineVersionStats } from '../../types/backend';

interface Props {
    stats: PipelineVersionStats;
}

export const PipelineStatsChart: FC<Props> = ({ stats }) => {
    const [isRegistered, setIsRegistered] = useState(false);

    useEffect(() => {
        ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
        setIsRegistered(true);
    }, []);

    if (!isRegistered) {
        return null;
    }

    const versionsSet = new Set<number>();
    Object.values(stats).forEach((versionMap) => {
        Object.keys(versionMap).forEach((v) => versionsSet.add(Number(v)));
    });
    const versions = Array.from(versionsSet).sort((a, b) => a - b);
    const colors = ['#88a1d2', '#6b84c6', '#586bb8', '#4d5ba8', '#3e467e', '#3a416e'];

    const datasets = Object.entries(stats).map(([organism, versionMap], index) => ({
        label: organism,
        data: versions.map((v) => versionMap[v] ?? 0),
        backgroundColor: colors[index % colors.length],
    }));

    return (
        <Bar
            data={{ labels: versions, datasets }}
            options={{ plugins: { legend: { position: 'bottom' } }, responsive: true }}
        />
    );
};
