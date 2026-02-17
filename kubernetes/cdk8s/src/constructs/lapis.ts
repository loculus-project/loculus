import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { LoculusValues, EnabledOrganism } from '../values';
import { dockerTag } from '../docker-tag';
import { configProcessorContainer, configVolumes } from '../config-processor';
import { getResources, priorityClassName } from '../resources';
import { getEnabledOrganisms } from '../organisms';

export class Lapis extends Construct {
  constructor(scope: Construct, id: string, values: LoculusValues, organism: EnabledOrganism) {
    super(scope, id);

    const tag = dockerTag(values);
    const key = organism.key;

    this.createDeployment(values, tag, key);
    this.createService(key);
  }

  private createDeployment(values: LoculusValues, tag: string, key: string): void {
    const containerSpec: any = {
      name: 'lapis',
      image: `${values.images.lapis.repository}:${values.images.lapis.tag}`,
      imagePullPolicy: values.images.lapis.pullPolicy || values.imagePullPolicy,
      ports: [{ containerPort: 8080 }],
      args: [`--silo.url=http://loculus-silo-service-${key}:8081`],
      env: [
        {
          name: 'JVM_OPTS',
          value:
            '-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:+UseG1GC -XX:MaxHeapFreeRatio=5 -XX:MinHeapFreeRatio=2 -XX:MaxGCPauseMillis=100',
        },
      ],
      volumeMounts: [
        {
          name: 'lapis-silo-database-config-processed',
          mountPath: '/workspace/database_config.yaml',
          subPath: 'database_config.yaml',
        },
        {
          name: 'lapis-silo-database-config-processed',
          mountPath: '/workspace/reference_genomes.json',
          subPath: 'reference_genomes.json',
        },
      ],
      startupProbe: {
        httpGet: { path: '/actuator/health', port: 8080 },
        periodSeconds: 5,
        failureThreshold: 36,
      },
      readinessProbe: {
        httpGet: { path: '/sample/info', port: 8080 },
        periodSeconds: 10,
        failureThreshold: 3,
        timeoutSeconds: 5,
      },
      livenessProbe: {
        httpGet: { path: '/actuator/health', port: 8080 },
        periodSeconds: 10,
        failureThreshold: 3,
        timeoutSeconds: 5,
      },
    };

    const resources = getResources('lapis', values, key);
    if (resources) Object.assign(containerSpec, resources);

    new ApiObject(this, 'deployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: `loculus-lapis-${key}`,
        annotations: {},
      },
      spec: {
        replicas: values.replicas.lapis || 1,
        selector: { matchLabels: { app: 'loculus', component: `lapis-${key}` } },
        template: {
          metadata: {
            annotations: { timestamp: new Date().toISOString() },
            labels: { app: 'loculus', component: `lapis-${key}` },
          },
          spec: {
            ...priorityClassName(values),
            initContainers: [configProcessorContainer('lapis-silo-database-config', tag, values.imagePullPolicy)],
            containers: [containerSpec],
            volumes: configVolumes('lapis-silo-database-config', `lapis-silo-database-config-${key}`),
          },
        },
      },
    });
  }

  private createService(key: string): void {
    new ApiObject(this, 'service', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: `loculus-lapis-service-${key}` },
      spec: {
        type: 'ClusterIP',
        selector: { app: 'loculus', component: `lapis-${key}` },
        ports: [{ port: 8080, targetPort: 8080, protocol: 'TCP', name: 'http' }],
      },
    });
  }
}

/** Creates the shared LAPIS ingress resources (one set for all organisms) */
export class LapisIngress extends Construct {
  constructor(scope: Construct, id: string, values: LoculusValues) {
    super(scope, id);

    const organisms = getEnabledOrganisms(values);
    const organismKeys = organisms.map((o) => o.key);
    const ns = 'default'; // Release namespace equivalent

    // CORS middleware
    new ApiObject(this, 'cors', {
      apiVersion: 'traefik.containo.us/v1alpha1',
      kind: 'Middleware',
      metadata: { name: 'cors-all-origins' },
      spec: {
        headers: {
          accessControlAllowMethods: ['GET', 'OPTIONS', 'POST', 'HEAD'],
          accessControlAllowOriginList: ['*'],
          accessControlMaxAge: 100,
          accessControlAllowHeaders: ['*'],
        },
      },
    });

    // Strip prefix middlewares per organism
    for (const key of organismKeys) {
      new ApiObject(this, `strip-${key}`, {
        apiVersion: 'traefik.containo.us/v1alpha1',
        kind: 'Middleware',
        metadata: { name: `strip-${key}-prefix` },
        spec: {
          stripPrefix: { prefixes: [`/${key}/`] },
        },
      });
    }

    // Main LAPIS ingress
    const stripMiddlewares = organismKeys.map((k) => `${ns}-strip-${k}-prefix@kubernetescrd`).join(',');
    const mainMiddlewares = `${ns}-cors-all-origins@kubernetescrd,${stripMiddlewares}`;

    const paths = organismKeys.map((key) => ({
      path: `/${key}/`,
      pathType: values.environment === 'server' ? 'ImplementationSpecific' : 'Prefix',
      backend: {
        service: { name: `loculus-lapis-service-${key}`, port: { number: 8080 } },
      },
    }));

    const lapisHost =
      values.environment === 'server' ? `lapis${values.subdomainSeparator || '.'}${values.host}` : undefined;

    const mainIngressSpec: any = {
      rules: [
        {
          ...(lapisHost ? { host: lapisHost } : {}),
          http: { paths },
        },
      ],
    };
    if (values.environment === 'server' && lapisHost) {
      mainIngressSpec.tls = [{ hosts: [lapisHost] }];
    }

    new ApiObject(this, 'ingress', {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: 'lapis-ingress',
        annotations: {
          'traefik.ingress.kubernetes.io/router.middlewares': mainMiddlewares,
        },
      },
      spec: mainIngressSpec,
    });

    // Redirect slash middleware
    new ApiObject(this, 'redirect-slash', {
      apiVersion: 'traefik.containo.us/v1alpha1',
      kind: 'Middleware',
      metadata: { name: 'redirect-slash' },
      spec: {
        redirectRegex: { regex: '.*', replacement: '$0/', permanent: true },
      },
    });

    // Redirect ingress for trailing slash
    const redirectMiddlewareList: string[] = [];
    if (values.enforceHTTPS) {
      redirectMiddlewareList.push(`${ns}-redirect-middleware@kubernetescrd`);
    }
    redirectMiddlewareList.push(`${ns}-redirect-slash@kubernetescrd`);

    const redirectPaths = organismKeys.map((key) => ({
      path: `/${key}`,
      pathType: 'Exact',
      backend: {
        service: { name: `loculus-lapis-service-${organismKeys[0]}`, port: { number: 8080 } },
      },
    }));

    new ApiObject(this, 'redirect-ingress', {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: 'lapis-redirect-ingress',
        annotations: {
          'traefik.ingress.kubernetes.io/router.middlewares': redirectMiddlewareList.join(','),
          'traefik.ingress.kubernetes.io/router.priority': '500',
        },
      },
      spec: {
        rules: [
          {
            ...(lapisHost ? { host: lapisHost } : {}),
            http: { paths: redirectPaths },
          },
        ],
      },
    });
  }
}
