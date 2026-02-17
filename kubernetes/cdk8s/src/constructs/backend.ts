import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { LoculusValues } from '../values';
import { dockerTag } from '../docker-tag';
import { configProcessorContainer, configVolumes } from '../config-processor';
import { getResources, serviceType, priorityClassName } from '../resources';
import { s3Url, s3UrlInternal } from '../urls';
import { generateBackendConfig } from '../config-generation';

export class Backend extends Construct {
  constructor(scope: Construct, id: string, values: LoculusValues) {
    super(scope, id);

    if (values.disableBackend) return;

    const tag = dockerTag(values);

    this.createConfigMap(values);
    this.createDeployment(values, tag);
    this.createService(values);
  }

  private createConfigMap(values: LoculusValues): void {
    const config = generateBackendConfig(values);
    new ApiObject(this, 'config', {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'loculus-backend-config' },
      data: {
        'backend_config.json': JSON.stringify(config),
      },
    });
  }

  private createDeployment(values: LoculusValues, tag: string): void {
    const args: string[] = [`--loculus.enable-seqsets=${values.seqSets.enabled}`];

    if (values.seqSets.crossRef) {
      args.push(
        '--crossref.doi-prefix=$(CROSSREF_DOI_PREFIX)',
        '--crossref.endpoint=$(CROSSREF_ENDPOINT)',
        '--crossref.username=$(CROSSREF_USERNAME)',
        '--crossref.password=$(CROSSREF_PASSWORD)',
        '--crossref.database-name=$(CROSSREF_DATABASE_NAME)',
        '--crossref.email=$(CROSSREF_EMAIL)',
        '--crossref.organization=$(CROSSREF_ORGANIZATION)',
        '--crossref.host-url=$(CROSSREF_HOST_URL)',
      );
    }

    args.push(
      '--keycloak.password=$(BACKEND_KEYCLOAK_PASSWORD)',
      '--keycloak.realm=loculus',
      '--keycloak.client=backend-client',
      '--keycloak.url=http://loculus-keycloak-service:8083',
      '--keycloak.user=backend',
      '--spring.datasource.password=$(DB_PASSWORD)',
      '--spring.datasource.url=$(DB_URL)',
      '--spring.datasource.username=$(DB_USERNAME)',
      '--spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://loculus-keycloak-service:8083/realms/loculus/protocol/openid-connect/certs',
      `--loculus.cleanup.task.reset-stale-in-processing-after-seconds=${values.preprocessingTimeout || 120}`,
      `--loculus.pipeline-version-upgrade-check.interval-seconds=${values.pipelineVersionUpgradeCheckIntervalSeconds || 10}`,
      '--loculus.s3.enabled=$(S3_ENABLED)',
    );

    if (values.s3.enabled) {
      args.push(
        '--loculus.s3.bucket.endpoint=$(S3_BUCKET_ENDPOINT)',
        '--loculus.s3.bucket.internal-endpoint=$(S3_BUCKET_INTERNAL_ENDPOINT)',
        '--loculus.s3.bucket.region=$(S3_BUCKET_REGION)',
        '--loculus.s3.bucket.bucket=$(S3_BUCKET_BUCKET)',
        '--loculus.s3.bucket.access-key=$(S3_BUCKET_ACCESS_KEY)',
        '--loculus.s3.bucket.secret-key=$(S3_BUCKET_SECRET_KEY)',
      );
    }

    if (values.backendExtraArgs) {
      args.push(...values.backendExtraArgs);
    }

    const env: any[] = [
      {
        name: 'JVM_OPTS',
        value: '-XX:+UseContainerSupport -XX:+UseG1GC -XX:MaxHeapFreeRatio=5 -XX:MinHeapFreeRatio=2',
      },
    ];

    if (values.seqSets.crossRef) {
      env.push(
        { name: 'CROSSREF_USERNAME', valueFrom: { secretKeyRef: { name: 'crossref', key: 'username' } } },
        { name: 'CROSSREF_PASSWORD', valueFrom: { secretKeyRef: { name: 'crossref', key: 'password' } } },
        { name: 'CROSSREF_DOI_PREFIX', value: String(values.seqSets.crossRef.DOIPrefix) },
        { name: 'CROSSREF_ENDPOINT', value: String(values.seqSets.crossRef.endpoint) },
        { name: 'CROSSREF_DATABASE_NAME', value: values.seqSets.crossRef.databaseName || null },
        { name: 'CROSSREF_EMAIL', value: values.seqSets.crossRef.email || null },
        { name: 'CROSSREF_ORGANIZATION', value: values.seqSets.crossRef.organization || null },
        { name: 'CROSSREF_HOST_URL', value: values.seqSets.crossRef.hostUrl || null },
      );
    }

    env.push(
      {
        name: 'BACKEND_KEYCLOAK_PASSWORD',
        valueFrom: { secretKeyRef: { name: 'service-accounts', key: 'backendUserPassword' } },
      },
      { name: 'DB_URL', valueFrom: { secretKeyRef: { name: 'database', key: 'url' } } },
      { name: 'DB_USERNAME', valueFrom: { secretKeyRef: { name: 'database', key: 'username' } } },
      { name: 'DB_PASSWORD', valueFrom: { secretKeyRef: { name: 'database', key: 'password' } } },
      { name: 'S3_ENABLED', value: String(values.s3.enabled) },
    );

    if (values.s3.enabled) {
      env.push(
        { name: 'S3_BUCKET_ENDPOINT', value: s3Url(values) },
        { name: 'S3_BUCKET_INTERNAL_ENDPOINT', value: s3UrlInternal(values) },
        { name: 'S3_BUCKET_REGION', value: values.s3.bucket.region || '' },
        { name: 'S3_BUCKET_BUCKET', value: values.s3.bucket.bucket },
        { name: 'S3_BUCKET_ACCESS_KEY', valueFrom: { secretKeyRef: { name: 's3-bucket', key: 'accessKey' } } },
        { name: 'S3_BUCKET_SECRET_KEY', valueFrom: { secretKeyRef: { name: 's3-bucket', key: 'secretKey' } } },
      );
    }

    const containerSpec: any = {
      name: 'backend',
      image: `${values.images.backend.repository}:${values.images.backend.tag || tag}`,
      imagePullPolicy: values.images.backend.pullPolicy || values.imagePullPolicy,
      startupProbe: {
        httpGet: { path: '/actuator/health/liveness', port: 8079 },
        periodSeconds: 5,
        failureThreshold: 360,
      },
      livenessProbe: {
        httpGet: { path: '/actuator/health/liveness', port: 8079 },
        periodSeconds: 10,
      },
      readinessProbe: {
        httpGet: { path: '/actuator/health/readiness', port: 8079 },
      },
      ports: [{ containerPort: 8079 }],
      args,
      env,
      volumeMounts: [{ name: 'loculus-backend-config-processed', mountPath: '/config' }],
    };

    const resources = getResources('backend', values);
    if (resources) Object.assign(containerSpec, resources);

    new ApiObject(this, 'deployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'loculus-backend',
        annotations: { 'argocd.argoproj.io/sync-options': 'Replace=true' },
      },
      spec: {
        replicas: values.replicas.backend,
        selector: { matchLabels: { app: 'loculus', component: 'backend' } },
        template: {
          metadata: {
            annotations: { timestamp: new Date().toISOString() },
            labels: { app: 'loculus', component: 'backend' },
          },
          spec: {
            ...priorityClassName(values),
            initContainers: [configProcessorContainer('loculus-backend-config', tag, values.imagePullPolicy)],
            containers: [containerSpec],
            volumes: configVolumes('loculus-backend-config'),
          },
        },
      },
    });
  }

  private createService(values: LoculusValues): void {
    const portSpec: any = {
      port: 8079,
      targetPort: 8079,
      protocol: 'TCP',
      name: 'http',
    };
    if (values.environment !== 'server') {
      portSpec.nodePort = 30082;
    }

    new ApiObject(this, 'service', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: 'loculus-backend-service' },
      spec: {
        type: serviceType(values),
        selector: { app: 'loculus', component: 'backend' },
        ports: [portSpec],
      },
    });
  }
}
