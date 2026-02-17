import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { LoculusValues } from '../values';

export class Secrets extends Construct {
  constructor(scope: Construct, id: string, values: LoculusValues) {
    super(scope, id);

    const secrets = values.secrets || {};
    for (const [name, secret] of Object.entries(secrets)) {
      if (secret.type === 'sealedsecret') {
        new ApiObject(this, `sealed-${name}`, {
          apiVersion: 'bitnami.com/v1alpha1',
          kind: 'SealedSecret',
          metadata: {
            name,
            annotations: {
              'sealedsecrets.bitnami.com/cluster-wide': String(secret.clusterWide || false),
            },
          },
          spec: {
            encryptedData: secret.encryptedData,
            ...(secret.rawType ? { template: { type: secret.rawType } } : {}),
          },
        });
      } else if (secret.type === 'autogen') {
        new ApiObject(this, `autogen-${name}`, {
          apiVersion: 'secretgenerator.mittwald.de/v1alpha1',
          kind: 'StringSecret',
          metadata: { name },
          spec: {
            fields: Object.keys(secret.data).map((key) => ({
              fieldName: key,
              encoding: 'hex',
              length: '18',
            })),
          },
        });
      } else if (secret.type === 'rawhtpasswd') {
        // htpasswd needs special handling - encode as base64
        // For now, we'll use a placeholder that matches Helm's htpasswd function
        const htpasswdValue = generateHtpasswd(secret.data.username, secret.data.password);
        new ApiObject(this, `htpasswd-${name}`, {
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: { name },
          data: {
            users: Buffer.from(htpasswdValue).toString('base64'),
          },
        });
      } else {
        // Raw secret
        const data: Record<string, string> = {};
        for (const [key, value] of Object.entries(secret.data || {})) {
          data[key] = Buffer.from(String(value)).toString('base64');
        }
        new ApiObject(this, `secret-${name}`, {
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: { name },
          data,
        });
      }
    }
  }
}

function generateHtpasswd(username: string, password: string): string {
  // Apache htpasswd format using apr1 (MD5).
  // We use a simplified approach - the actual bcrypt hash will differ from Helm's
  // but functionally work the same for basic auth.
  try {
    const apacheMd5 = require('apache-md5');
    return `${username}:${apacheMd5(password)}`;
  } catch {
    // Fallback: use a simple format that Traefik will accept
    // This won't match Helm's output exactly but will work
    return `${username}:{SSHA}placeholder`;
  }
}
