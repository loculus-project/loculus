import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { LoculusValues, EnabledOrganism } from '../values';
import { dockerTag } from '../docker-tag';
import { getResources, priorityClassName } from '../resources';
import { patchMetadataSchema, getNucleotideSegmentNames } from '../organisms';
import { generateIngestRename } from '../config-generation';
import * as yaml from 'js-yaml';

export class Ingest extends Construct {
  constructor(scope: Construct, id: string, values: LoculusValues, organism: EnabledOrganism) {
    super(scope, id);

    if (!organism.contents.ingest) return;

    const tag = dockerTag(values);
    const key = organism.key;
    const organismContent = organism.contents;
    const testconfig = values.testconfig || false;

    const backendHost =
      values.environment === 'server'
        ? `https://backend${values.subdomainSeparator || '.'}${values.host}`
        : testconfig
          ? `http://${values.localHost}:8079`
          : 'http://loculus-backend-service:8079';

    const enaDepositionHost = testconfig
      ? `http://${values.localHost}:5000`
      : 'http://loculus-ena-submission-service:5000';

    const keycloakHost = testconfig ? `http://${values.localHost}:8083` : 'http://loculus-keycloak-service:8083';

    // ConfigMap is always created when organism has ingest config
    if (organismContent.ingest!.configFile) {
      this.createConfigMap(values, tag, key, organismContent, backendHost, keycloakHost, enaDepositionHost);
    }

    // Deployments and CronJobs are gated by disableIngest
    if (values.disableIngest) return;

    // Deployment
    this.createDeployment(values, tag, key, organismContent);

    // CronJob
    this.createCronJob(values, tag, key, organismContent);
  }

  private createConfigMap(
    values: LoculusValues,
    tag: string,
    key: string,
    organismContent: any,
    backendHost: string,
    keycloakHost: string,
    enaDepositionHost: string,
  ): void {
    const patchedSchema = patchMetadataSchema(organismContent.schema);
    const metadata = patchedSchema.metadata;
    const segments = getNucleotideSegmentNames(organismContent.referenceGenomes);

    const config: any = {
      ...organismContent.ingest!.configFile,
      nucleotide_sequences: segments,
      verify_loculus_version_is: tag,
      check_ena_deposition: !values.disableEnaSubmission,
    };

    if (!values.disableEnaSubmission) {
      config.ena_deposition_url = enaDepositionHost;
    }

    config.organism = key;
    config.backend_url = backendHost;
    config.keycloak_token_url = `${keycloakHost}/realms/loculus/protocol/openid-connect/token`;

    if (values.ingest?.ncbiGatewayUrl) config.ncbi_gateway_url = values.ingest.ncbiGatewayUrl;
    if (values.ingest?.mirrorBucket) config.mirror_bucket = values.ingest.mirrorBucket;

    const rename = generateIngestRename(metadata);
    config.rename = rename;

    // INSDC segment-specific fields
    const insdcSegmentFields: string[] = [];
    for (const field of metadata) {
      if (field.header === 'INSDC' && field.perSegment) {
        insdcSegmentFields.push(field.name);
      }
    }
    config.insdc_segment_specific_fields = insdcSegmentFields;

    new ApiObject(this, 'config', {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: `loculus-ingest-config-${key}` },
      data: {
        'config.yaml': yaml.dump(config),
      },
    });
  }

  private createDeployment(values: LoculusValues, tag: string, key: string, organismContent: any): void {
    const containerSpec: any = {
      name: `ingest-${key}`,
      image: `${organismContent.ingest!.image}:${tag}`,
      imagePullPolicy: values.imagePullPolicy,
      env: [
        {
          name: 'KEYCLOAK_INGEST_PASSWORD',
          valueFrom: { secretKeyRef: { name: 'service-accounts', key: 'insdcIngestUserPassword' } },
        },
        { name: 'SLACK_HOOK', valueFrom: { secretKeyRef: { name: 'slack-notifications', key: 'slack-hook' } } },
        { name: 'NCBI_API_KEY', valueFrom: { secretKeyRef: { name: 'ingest-ncbi', key: 'api-key' } } },
      ],
      args: ['snakemake', 'results/submitted', 'results/revised', 'results/approved', '--all-temp'],
    };

    const resources = getResources('ingest', values);
    if (resources) Object.assign(containerSpec, resources);

    const podSpec: any = {
      ...priorityClassName(values),
      initContainers: [
        {
          name: 'version-check',
          image: 'busybox',
          command: [
            'sh',
            '-c',
            `CONFIG_VERSION=$(grep "verify_loculus_version_is:" /package/config/config.yaml | sed "s/verify_loculus_version_is: //;");\nDOCKER_TAG="${tag}";\necho "Config version: $CONFIG_VERSION";\necho "Docker tag: $DOCKER_TAG";\nif [ "$CONFIG_VERSION" != "$DOCKER_TAG" ]; then\n  echo "Version mismatch: ConfigMap version $CONFIG_VERSION does not match docker tag $DOCKER_TAG";\n  exit 1;\nelse\n  echo "Version match confirmed";\nfi`,
          ],
          volumeMounts: [
            {
              name: `loculus-ingest-config-volume-${key}`,
              mountPath: '/package/config/config.yaml',
              subPath: 'config.yaml',
            },
          ],
        },
      ],
      containers: [containerSpec],
    };

    const initResources = getResources('ingest-init', values);
    if (initResources) Object.assign(podSpec.initContainers[0], initResources);

    if (organismContent.ingest!.configFile) {
      containerSpec.volumeMounts = [
        {
          name: `loculus-ingest-config-volume-${key}`,
          mountPath: '/package/config/config.yaml',
          subPath: 'config.yaml',
        },
      ];
      podSpec.volumes = [
        {
          name: `loculus-ingest-config-volume-${key}`,
          configMap: { name: `loculus-ingest-config-${key}` },
        },
      ];
    }

    new ApiObject(this, 'deployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: `loculus-ingest-deployment-${key}`,
        annotations: { 'argocd.argoproj.io/sync-options': 'Force=true,Replace=true' },
      },
      spec: {
        replicas: 1,
        strategy: { type: 'Recreate' },
        selector: { matchLabels: { app: 'loculus', component: `loculus-ingest-deployment-${key}` } },
        template: {
          metadata: {
            annotations: { timestamp: new Date().toISOString() },
            labels: { app: 'loculus', component: `loculus-ingest-deployment-${key}` },
          },
          spec: podSpec,
        },
      },
    });
  }

  private createCronJob(values: LoculusValues, tag: string, key: string, organismContent: any): void {
    const containerSpec: any = {
      name: `ingest-${key}`,
      image: `${organismContent.ingest!.image}:${tag}`,
      imagePullPolicy: values.imagePullPolicy,
      resources: {
        requests: { memory: '1Gi', cpu: '200m' },
        limits: { cpu: '200m', memory: '10Gi' },
      },
      env: [
        {
          name: 'KEYCLOAK_INGEST_PASSWORD',
          valueFrom: { secretKeyRef: { name: 'service-accounts', key: 'insdcIngestUserPassword' } },
        },
      ],
      args: ['snakemake', 'results/submitted', 'results/revised', 'results/revoked', 'results/approved', '--all-temp'],
    };

    const podSpec: any = {
      ...priorityClassName(values),
      restartPolicy: 'Never',
      containers: [containerSpec],
    };

    if (organismContent.ingest!.configFile) {
      containerSpec.volumeMounts = [
        {
          name: `loculus-ingest-config-volume-${key}`,
          mountPath: '/package/config/config.yaml',
          subPath: 'config.yaml',
        },
      ];
      podSpec.volumes = [
        {
          name: `loculus-ingest-config-volume-${key}`,
          configMap: { name: `loculus-ingest-config-${key}` },
        },
      ];
    }

    new ApiObject(this, 'cronjob', {
      apiVersion: 'batch/v1',
      kind: 'CronJob',
      metadata: {
        name: `loculus-revoke-and-regroup-cronjob-${key}`,
        annotations: { 'argocd.argoproj.io/sync-options': 'Replace=true' },
      },
      spec: {
        schedule: '0 0 31 2 *',
        suspend: true,
        startingDeadlineSeconds: 60,
        concurrencyPolicy: 'Forbid',
        jobTemplate: {
          spec: {
            activeDeadlineSeconds: values.ingestLimitSeconds,
            template: {
              metadata: {
                labels: { app: 'loculus', component: `loculus-ingest-cronjob-${key}` },
              },
              spec: podSpec,
            },
          },
        },
      },
    });
  }
}
