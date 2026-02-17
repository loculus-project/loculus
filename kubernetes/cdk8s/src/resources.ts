import { LoculusValues } from './values';

export function getResources(containerName: string, values: LoculusValues, organism?: string): any | undefined {
  if (organism && values.resources?.organismSpecific?.[organism]?.[containerName]) {
    return { resources: values.resources.organismSpecific[organism][containerName] };
  }
  if (values.resources?.[containerName]) {
    return { resources: values.resources[containerName] };
  }
  if (values.defaultResources) {
    return { resources: values.defaultResources };
  }
  return undefined;
}

export function serviceType(values: LoculusValues): string {
  return values.environment === 'server' ? 'ClusterIP' : 'NodePort';
}

export function priorityClassName(values: LoculusValues): any {
  if (values.podPriorityClassName) {
    return { priorityClassName: values.podPriorityClassName };
  }
  return {};
}
