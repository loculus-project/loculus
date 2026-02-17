import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { LoculusValues } from '../values';
import { dockerTag } from '../docker-tag';
import { getResources } from '../resources';

export class Docs extends Construct {
  constructor(scope: Construct, id: string, values: LoculusValues) {
    super(scope, id);

    if (!values.previewDocs) return;

    const tag = dockerTag(values);
    const docsHost = `docs${values.subdomainSeparator || '.'}${values.host}`;

    const containerSpec: any = {
      name: 'docs',
      image: `ghcr.io/loculus-project/docs:${tag}`,
      imagePullPolicy: values.imagePullPolicy,
      ports: [{ containerPort: 8080 }],
    };

    const resources = getResources('docs', values);
    if (resources) Object.assign(containerSpec, resources);

    new ApiObject(this, 'deployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'loculus-docs',
        annotations: { 'argocd.argoproj.io/sync-options': 'Replace=true' },
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'loculus', component: 'docs' } },
        template: {
          metadata: {
            annotations: { timestamp: new Date().toISOString() },
            labels: { app: 'loculus', component: 'docs' },
          },
          spec: { containers: [containerSpec] },
        },
      },
    });

    new ApiObject(this, 'service', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: 'loculus-docs' },
      spec: {
        selector: { app: 'loculus', component: 'docs' },
        ports: [{ protocol: 'TCP', port: 80, targetPort: 8080 }],
      },
    });

    new ApiObject(this, 'ingress', {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: { name: 'loculus-docs-ingress' },
      spec: {
        rules: [
          {
            host: docsHost,
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: { service: { name: 'loculus-docs', port: { number: 80 } } },
                },
              ],
            },
          },
        ],
        tls: [{ hosts: [docsHost] }],
      },
    });
  }
}
