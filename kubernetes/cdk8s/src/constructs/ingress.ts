import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { LoculusValues } from '../values';

export class MainIngress extends Construct {
  constructor(scope: Construct, id: string, values: LoculusValues) {
    super(scope, id);

    // Middleware CRDs are always created (even in local environment)
    new ApiObject(this, 'compression', {
      apiVersion: 'traefik.containo.us/v1alpha1',
      kind: 'Middleware',
      metadata: { name: 'compression-middleware' },
      spec: { compress: {} },
    });

    new ApiObject(this, 'redirect', {
      apiVersion: 'traefik.containo.us/v1alpha1',
      kind: 'Middleware',
      metadata: { name: 'redirect-middleware' },
      spec: { redirectScheme: { scheme: 'https', permanent: true } },
    });

    if (values.secrets?.basicauth) {
      new ApiObject(this, 'basic-auth', {
        apiVersion: 'traefik.containo.us/v1alpha1',
        kind: 'Middleware',
        metadata: { name: 'basic-auth' },
        spec: { basicAuth: { secret: 'basicauth' } },
      });
    }

    if (values.robotsNoindexHeader) {
      new ApiObject(this, 'noindex', {
        apiVersion: 'traefik.containo.us/v1alpha1',
        kind: 'Middleware',
        metadata: { name: 'noindex-robots-header' },
        spec: { headers: { customResponseHeaders: { 'X-Robots-Tag': 'noindex, nofollow' } } },
      });
    }

    new ApiObject(this, 'redirect-www', {
      apiVersion: 'traefik.containo.us/v1alpha1',
      kind: 'Middleware',
      metadata: { name: 'redirect-www-middleware' },
      spec: {
        redirectRegex: {
          regex: '^https://www\\.(.*)',
          replacement: 'https://$1',
          permanent: true,
        },
      },
    });

    // Ingress resources are only created in server mode
    if (values.environment !== 'server') return;

    const ns = 'default';
    const backendHost = `backend${values.subdomainSeparator || '.'}${values.host}`;
    const keycloakHost = `authentication${values.subdomainSeparator || '.'}${values.host}`;
    const minioHost = `s3${values.subdomainSeparator || '.'}${values.host}`;

    // Build middleware lists
    const middlewareList = [`${ns}-compression-middleware@kubernetescrd`];
    if (values.enforceHTTPS) {
      middlewareList.push(`${ns}-redirect-middleware@kubernetescrd`);
    }
    if (values.robotsNoindexHeader) {
      middlewareList.push(`${ns}-noindex-robots-header@kubernetescrd`);
    }

    const websiteMiddlewareList = [...middlewareList];
    const keycloakMiddlewareList = [...middlewareList];

    if (values.secrets?.basicauth) {
      websiteMiddlewareList.push(`${ns}-basic-auth@kubernetescrd`);
      keycloakMiddlewareList.push(`${ns}-basic-auth@kubernetescrd`);
    }
    websiteMiddlewareList.push(`${ns}-redirect-www-middleware@kubernetescrd`);

    // Website ingress
    new ApiObject(this, 'website-ingress', {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: 'loculus-website-ingress',
        annotations: { 'traefik.ingress.kubernetes.io/router.middlewares': websiteMiddlewareList.join(',') },
      },
      spec: {
        rules: [
          {
            host: values.host!,
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: { service: { name: 'loculus-website-service', port: { number: 3000 } } },
                },
              ],
            },
          },
          {
            host: `www.${values.host}`,
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: { service: { name: 'loculus-website-service', port: { number: 3000 } } },
                },
              ],
            },
          },
        ],
        tls: [{ hosts: [values.host!, `www.${values.host}`] }],
      },
    });

    // Backend ingress
    new ApiObject(this, 'backend-ingress', {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: 'loculus-backend-ingress',
        annotations: { 'traefik.ingress.kubernetes.io/router.middlewares': middlewareList.join(',') },
      },
      spec: {
        rules: [
          {
            host: backendHost,
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: { service: { name: 'loculus-backend-service', port: { number: 8079 } } },
                },
              ],
            },
          },
        ],
        tls: [{ hosts: [backendHost] }],
      },
    });

    // Keycloak ingress
    new ApiObject(this, 'keycloak-ingress', {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: 'loculus-keycloak-ingress',
        annotations: { 'traefik.ingress.kubernetes.io/router.middlewares': keycloakMiddlewareList.join(',') },
      },
      spec: {
        rules: [
          {
            host: keycloakHost,
            http: {
              paths: [
                {
                  path: '/{+}',
                  pathType: 'Prefix',
                  backend: { service: { name: 'loculus-keycloak-service', port: { number: 8083 } } },
                },
              ],
            },
          },
        ],
        tls: [{ hosts: [keycloakHost] }],
      },
    });

    // MinIO ingress (conditional)
    if (values.s3.enabled && values.runDevelopmentS3) {
      new ApiObject(this, 'minio-ingress', {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'Ingress',
        metadata: {
          name: 'minio-ingress',
          annotations: { 'traefik.ingress.kubernetes.io/router.middlewares': middlewareList.join(',') },
        },
        spec: {
          rules: [
            {
              host: minioHost,
              http: {
                paths: [
                  {
                    path: '/',
                    pathType: 'Prefix',
                    backend: { service: { name: 'loculus-minio-service', port: { number: 8084 } } },
                  },
                ],
              },
            },
          ],
          tls: [{ hosts: [minioHost] }],
        },
      });
    }
  }
}
