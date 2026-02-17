import { LoculusValues, EnabledOrganism } from './values';
import { getEnabledOrganisms } from './organisms';

export function backendUrl(values: LoculusValues): string {
  if (values.public?.backendUrl) return values.public.backendUrl;
  if (values.environment === 'server') {
    return `https://backend${values.subdomainSeparator || '.'}${values.host}`;
  }
  return `http://${values.localHost}:8079`;
}

export function websiteUrl(values: LoculusValues): string {
  if (values.public?.websiteUrl) return values.public.websiteUrl;
  if (values.environment === 'server') {
    return `https://${values.host}`;
  }
  return `http://${values.localHost}:3000`;
}

export function s3Url(values: LoculusValues): string {
  if (values.runDevelopmentS3) {
    if (values.environment === 'server') {
      return `https://s3${values.subdomainSeparator || '.'}${values.host}`;
    }
    return `http://${values.localHost}:8084`;
  }
  return values.s3.bucket.endpoint || '';
}

export function s3UrlInternal(values: LoculusValues): string {
  if (values.runDevelopmentS3) {
    return 'http://loculus-minio-service:8084';
  }
  return values.s3.bucket.endpoint || '';
}

export function keycloakUrl(values: LoculusValues): string {
  if (values.public?.keycloakUrl) return values.public.keycloakUrl;
  if (values.environment === 'server') {
    return `https://authentication${values.subdomainSeparator || '.'}${values.host}`;
  }
  return `http://${values.localHost}:8083`;
}

export function lapisUrlTemplate(values: LoculusValues): string {
  if (values.public?.lapisUrlTemplate) return values.public.lapisUrlTemplate;
  if (values.environment === 'server') {
    return `https://lapis${values.subdomainSeparator || '.'}${values.host}/%organism%`;
  }
  return `http://${values.localHost}:8080/%organism%`;
}

export function generateInternalLapisUrls(values: LoculusValues): Record<string, string> {
  const result: Record<string, string> = {};
  for (const org of getEnabledOrganisms(values)) {
    if (!values.disableWebsite) {
      result[org.key] = `http://loculus-lapis-service-${org.key}:8080`;
    } else {
      result[org.key] = `http://${values.localHost}:8080/${org.key}`;
    }
  }
  return result;
}

export function generateExternalLapisUrls(values: LoculusValues): Record<string, string> {
  const template = lapisUrlTemplate(values);
  const result: Record<string, string> = {};
  const organisms = values.organisms || values.defaultOrganisms || {};
  for (const [key, organism] of Object.entries(organisms)) {
    if (organism.enabled !== false) {
      result[key] = template.replace('%organism%', key);
    }
  }
  return result;
}
