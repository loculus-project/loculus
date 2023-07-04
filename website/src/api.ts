import { getConfig } from './config';

export async function fetchNumberSequences(config = getConfig()): Promise<number> {
  const response = await fetch(`${config.lapisHost}/aggregated?country=Switzerland`);
  return (await response.json()).data[0].count;
}

export async function fetchSequenceList(config = getConfig()): Promise<any[]> {
  const response = await fetch(`${config.lapisHost}/details?fields=${config.schema.primaryKey}&country=Switzerland`);
  return (await response.json()).data;
}

export async function fetchSequenceDetails(accession: string, config = getConfig()): Promise<any> {
  const response = await fetch(`${config.lapisHost}/details?${config.schema.primaryKey}=${accession}`);
  return (await response.json()).data[0];
}
