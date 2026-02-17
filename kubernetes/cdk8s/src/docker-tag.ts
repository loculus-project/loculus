import { LoculusValues } from './values';

export function dockerTag(values: LoculusValues): string {
  if (values.sha) {
    return `commit-${values.sha.substring(0, 7)}`;
  }
  const branch = values.branch || 'latest';
  if (branch === 'main') {
    return 'latest';
  }
  return `branch-${branch.replace(/\//g, '-')}`;
}
