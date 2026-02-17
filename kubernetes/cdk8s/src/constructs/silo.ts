import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { LoculusValues, EnabledOrganism, MetadataField } from '../values';
import { dockerTag } from '../docker-tag';
import { configProcessorContainer, configVolumes } from '../config-processor';
import { getResources, priorityClassName } from '../resources';
import { patchMetadataSchema, lineageSystemForOrganism, mergeReferenceGenomes } from '../organisms';
import { generateSiloDatabaseConfig, commonMetadataFields } from '../config-generation';

export class Silo extends Construct {
  constructor(scope: Construct, id: string, values: LoculusValues, organism: EnabledOrganism) {
    super(scope, id);

    const tag = dockerTag(values);
    const key = organism.key;
    const organismContent = organism.contents;
    const lineageSystem = lineageSystemForOrganism(organismContent);

    this.createConfigMap(values, key, organismContent, lineageSystem);
    this.createDeployment(values, tag, key, organismContent, lineageSystem);
    this.createService(key);
  }

  private createConfigMap(
    values: LoculusValues,
    key: string,
    organismContent: any,
    lineageSystem: string | undefined,
  ): void {
    const patchedSchema = patchMetadataSchema(organismContent.schema);
    const common = commonMetadataFields(values);
    const dbConfig = generateSiloDatabaseConfig(patchedSchema, common, organismContent.referenceGenomes);
    const merged = mergeReferenceGenomes(organismContent.referenceGenomes);

    const yaml = require('js-yaml');
    const preprocessingConfig: any = {
      inputDirectory: '/preprocessing/input',
      outputDirectory: '/preprocessing/output',
      ndjsonInputFilename: 'data.ndjson.zst',
      referenceGenomeFilename: 'reference_genomes.json',
    };
    if (lineageSystem) {
      preprocessingConfig.lineageDefinitionFilenames = ['lineage_definitions.yaml'];
    }

    new ApiObject(this, 'config', {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: `lapis-silo-database-config-${key}` },
      data: {
        'database_config.yaml': yaml.dump(dbConfig),
        'preprocessing_config.yaml': yaml.dump(preprocessingConfig),
        'reference_genomes.json': JSON.stringify(merged),
      },
    });
  }

  private createDeployment(
    values: LoculusValues,
    tag: string,
    key: string,
    organismContent: any,
    lineageSystem: string | undefined,
  ): void {
    const siloContainer: any = {
      name: 'silo',
      image: `${values.images.loculusSilo.repository}:${values.images.loculusSilo.tag || tag}`,
      command: ['/usr/local/bin/silo'],
      imagePullPolicy: values.imagePullPolicy,
      env: [
        { name: 'SPDLOG_LEVEL', value: 'debug' },
        { name: 'SILO_DATA_DIRECTORY', value: '/data/' },
      ],
      ports: [{ containerPort: 8081 }],
      args: [
        'api',
        '--api-threads-for-http-connections',
        String(values.silo?.apiThreadsForHttpConnections || 16),
        '--api-max-queued-http-connections',
        '1000',
        '--query-materialization-cutoff',
        '3276',
      ],
      volumeMounts: [{ name: 'lapis-silo-shared-data', mountPath: '/data' }],
      readinessProbe: {
        httpGet: { path: '/info', port: 8081 },
        initialDelaySeconds: 30,
        periodSeconds: 10,
        failureThreshold: 3,
        timeoutSeconds: 5,
      },
      livenessProbe: {
        httpGet: { path: '/health', port: 8081 },
        initialDelaySeconds: 30,
        periodSeconds: 10,
        failureThreshold: 3,
        timeoutSeconds: 5,
      },
    };

    const siloResources = getResources('silo', values, key);
    if (siloResources) Object.assign(siloContainer, siloResources);

    const importerEnv: any[] = [];
    if (values.disableBackend) {
      importerEnv.push({ name: 'BACKEND_BASE_URL', value: `http://host.k3d.internal:8079/${key}` });
    } else {
      importerEnv.push({ name: 'BACKEND_BASE_URL', value: `http://loculus-backend-service:8079/${key}` });
    }

    if (lineageSystem) {
      const lineageDefs = values.lineageSystemDefinitions?.[lineageSystem];
      if (lineageDefs) {
        importerEnv.push({ name: 'LINEAGE_DEFINITIONS', value: JSON.stringify(lineageDefs) });
      }
    }

    importerEnv.push(
      { name: 'SILO_RUN_TIMEOUT_SECONDS', value: String(values.siloImport.siloTimeoutSeconds) },
      { name: 'HARD_REFRESH_INTERVAL', value: String(values.siloImport.hardRefreshIntervalSeconds) },
      { name: 'SILO_IMPORT_POLL_INTERVAL_SECONDS', value: String(values.siloImport.pollIntervalSeconds) },
      { name: 'PATH_TO_SILO_BINARY', value: '/usr/local/bin/silo' },
      { name: 'PREPROCESSING_CONFIG', value: '/app/preprocessing_config.yaml' },
    );

    const importerContainer: any = {
      name: 'silo-importer',
      image: `${values.images.loculusSilo.repository}:${values.images.loculusSilo.tag || tag}`,
      imagePullPolicy: values.images.loculusSilo.pullPolicy,
      env: importerEnv,
      volumeMounts: [
        {
          name: 'lapis-silo-database-config-processed',
          mountPath: '/preprocessing/input/reference_genomes.json',
          subPath: 'reference_genomes.json',
        },
        {
          name: 'lapis-silo-database-config-processed',
          mountPath: '/preprocessing/input/database_config.yaml',
          subPath: 'database_config.yaml',
        },
        {
          name: 'lapis-silo-database-config-processed',
          mountPath: '/app/preprocessing_config.yaml',
          subPath: 'preprocessing_config.yaml',
        },
        { name: 'lapis-silo-shared-data', mountPath: '/preprocessing/output' },
        { name: 'lapis-silo-input-data-cache', mountPath: '/preprocessing/input' },
      ],
    };

    const importerResources = getResources('silo-importer', values);
    if (importerResources) Object.assign(importerContainer, importerResources);

    const forceReplace = !values.developmentDatabasePersistence && values.runDevelopmentMainDatabase;
    const syncOptions = forceReplace ? 'Replace=true,Force=true' : 'Replace=true';

    new ApiObject(this, 'deployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: `loculus-silo-${key}`,
        annotations: { 'argocd.argoproj.io/sync-options': syncOptions },
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'loculus', component: `silo-${key}` } },
        template: {
          metadata: {
            annotations: { timestamp: new Date().toISOString() },
            labels: { app: 'loculus', component: `silo-${key}` },
          },
          spec: {
            ...priorityClassName(values),
            initContainers: [configProcessorContainer('lapis-silo-database-config', tag, values.imagePullPolicy)],
            containers: [siloContainer, importerContainer],
            volumes: [
              ...configVolumes('lapis-silo-database-config', `lapis-silo-database-config-${key}`),
              { name: 'lapis-silo-shared-data', emptyDir: {} },
              { name: 'lapis-silo-input-data-cache', emptyDir: {} },
            ],
          },
        },
      },
    });
  }

  private createService(key: string): void {
    new ApiObject(this, 'service', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: `loculus-silo-service-${key}` },
      spec: {
        type: 'ClusterIP',
        selector: { app: 'loculus', component: `silo-${key}` },
        ports: [{ port: 8081, targetPort: 8081, protocol: 'TCP', name: 'http' }],
      },
    });
  }
}
