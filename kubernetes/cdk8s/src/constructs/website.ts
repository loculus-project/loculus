import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { LoculusValues } from '../values';
import { dockerTag } from '../docker-tag';
import { configProcessorContainer, configVolumes } from '../config-processor';
import { getResources, serviceType, priorityClassName } from '../resources';
import { generateWebsiteConfig, generateRuntimeConfig } from '../config-generation';

export class Website extends Construct {
  constructor(scope: Construct, id: string, values: LoculusValues) {
    super(scope, id);

    if (values.disableWebsite) return;

    const tag = dockerTag(values);

    this.createConfigMap(values);
    this.createDeployment(values, tag);
    this.createService(values);
  }

  private createConfigMap(values: LoculusValues): void {
    const websiteConfig = generateWebsiteConfig(values);
    const runtimeConfig = generateRuntimeConfig(values);

    new ApiObject(this, 'config', {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'loculus-website-config' },
      data: {
        'website_config.json': JSON.stringify(websiteConfig),
        'runtime_config.json': JSON.stringify(runtimeConfig),
      },
    });
  }

  private createDeployment(values: LoculusValues, tag: string): void {
    const containerSpec: any = {
      name: 'website',
      image: `${values.images.website.repository}:${values.images.website.tag || tag}`,
      imagePullPolicy: values.images.website.pullPolicy || values.imagePullPolicy,
      ports: [{ containerPort: 3000 }],
      volumeMounts: [{ name: 'loculus-website-config-processed', mountPath: '/config' }],
      livenessProbe: {
        httpGet: { path: '/', port: 3000 },
        initialDelaySeconds: 30,
        periodSeconds: 10,
      },
      readinessProbe: {
        httpGet: { path: '/', port: 3000 },
        initialDelaySeconds: 5,
        periodSeconds: 5,
      },
    };

    const resources = getResources('website', values);
    if (resources) Object.assign(containerSpec, resources);

    new ApiObject(this, 'deployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'loculus-website',
        annotations: { 'argocd.argoproj.io/sync-options': 'Replace=true' },
      },
      spec: {
        replicas: values.replicas.website,
        selector: { matchLabels: { app: 'loculus', component: 'website' } },
        template: {
          metadata: {
            annotations: { timestamp: new Date().toISOString() },
            labels: { app: 'loculus', component: 'website' },
          },
          spec: {
            ...priorityClassName(values),
            initContainers: [configProcessorContainer('loculus-website-config', tag, values.imagePullPolicy)],
            containers: [containerSpec],
            imagePullSecrets: [{ name: 'custom-website-sealed-secret' }],
            volumes: configVolumes('loculus-website-config'),
          },
        },
      },
    });
  }

  private createService(values: LoculusValues): void {
    const portSpec: any = {
      port: 3000,
      targetPort: 3000,
      protocol: 'TCP',
      name: 'http',
    };
    if (values.environment !== 'server') {
      portSpec.nodePort = 30081;
    }

    new ApiObject(this, 'service', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: 'loculus-website-service' },
      spec: {
        type: serviceType(values),
        selector: { app: 'loculus', component: 'website' },
        ports: [portSpec],
      },
    });
  }
}
