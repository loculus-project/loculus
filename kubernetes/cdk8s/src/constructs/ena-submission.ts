import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { LoculusValues } from '../values';
import { dockerTag } from '../docker-tag';
import { getResources, serviceType, priorityClassName } from '../resources';
import { generateENASubmissionConfig } from '../config-generation';
import * as yaml from 'js-yaml';

export class EnaSubmission extends Construct {
  constructor(scope: Construct, id: string, values: LoculusValues) {
    super(scope, id);

    if (values.disableEnaSubmission) return;

    const tag = dockerTag(values);

    this.createConfigMap(values, tag);
    this.createDeployment(values, tag);
    this.createCronJob(values, tag);
    this.createService(values);
  }

  private createConfigMap(values: LoculusValues, tag: string): void {
    const testconfig = values.testconfig || false;
    const enaDepositionHost = testconfig ? '127.0.0.1' : '0.0.0.0';
    const backendHost =
      values.environment === 'server'
        ? `https://backend${values.subdomainSeparator || '.'}${values.host}`
        : testconfig
          ? `http://${values.localHost}:8079`
          : 'http://loculus-backend-service:8079';
    const keycloakHost = testconfig ? `http://${values.localHost}:8083` : 'http://loculus-keycloak-service:8083';

    const enaOrganisms = generateENASubmissionConfig(values);

    const config: any = {
      submit_to_ena_prod: values.enaDeposition?.submitToEnaProduction || false,
      db_name: values.enaDeposition?.enaDbName || false,
      is_broker: values.enaDeposition?.enaIsBroker || false,
      unique_project_suffix: values.enaDeposition?.enaUniqueSuffix || false,
      backend_url: backendHost,
      ena_deposition_host: enaDepositionHost,
      keycloak_token_url: `${keycloakHost}/realms/loculus/protocol/openid-connect/token`,
      approved_list_test_url: values.enaDeposition?.enaApprovedListTestUrl || '',
      suppressed_list_test_url: values.enaDeposition?.enaSuppressedListTestUrl || '',
      enaOrganisms,
    };

    new ApiObject(this, 'config', {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'loculus-ena-submission-config' },
      data: {
        'config.yaml': yaml.dump(config),
      },
    });
  }

  private createDeployment(values: LoculusValues, tag: string): void {
    const containerSpec: any = {
      name: 'ena-submission',
      image: `ghcr.io/loculus-project/ena-submission:${tag}`,
      imagePullPolicy: values.imagePullPolicy,
      env: [
        {
          name: 'EXTERNAL_METADATA_UPDATER_PASSWORD',
          valueFrom: { secretKeyRef: { name: 'service-accounts', key: 'externalMetadataUpdaterPassword' } },
        },
        { name: 'DB_URL', valueFrom: { secretKeyRef: { name: 'database', key: 'url' } } },
        { name: 'DB_USERNAME', valueFrom: { secretKeyRef: { name: 'database', key: 'username' } } },
        { name: 'DB_PASSWORD', valueFrom: { secretKeyRef: { name: 'database', key: 'password' } } },
        { name: 'SLACK_HOOK', valueFrom: { secretKeyRef: { name: 'slack-notifications', key: 'slack-hook' } } },
        { name: 'SLACK_TOKEN', valueFrom: { secretKeyRef: { name: 'slack-notifications', key: 'slack-token' } } },
        {
          name: 'SLACK_CHANNEL_ID',
          valueFrom: { secretKeyRef: { name: 'slack-notifications', key: 'slack-channel-id' } },
        },
        { name: 'ENA_USERNAME', valueFrom: { secretKeyRef: { name: 'ena-submission', key: 'username' } } },
        { name: 'ENA_PASSWORD', valueFrom: { secretKeyRef: { name: 'ena-submission', key: 'password' } } },
      ],
      args: ['ena_deposition', '--config-file=/config/config.yaml'],
      volumeMounts: [
        { name: 'loculus-ena-submission-config-volume', mountPath: '/config/config.yaml', subPath: 'config.yaml' },
      ],
    };

    const resources = getResources('ena-submission', values);
    if (resources) Object.assign(containerSpec, resources);

    new ApiObject(this, 'deployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'loculus-ena-submission',
        annotations: { 'argocd.argoproj.io/sync-options': 'Replace=true' },
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'loculus', component: 'loculus-ena-submission' } },
        template: {
          metadata: {
            annotations: { timestamp: new Date().toISOString() },
            labels: { app: 'loculus', component: 'loculus-ena-submission' },
          },
          spec: {
            ...priorityClassName(values),
            initContainers: [
              {
                name: 'ena-submission-flyway',
                image: `ghcr.io/loculus-project/ena-submission-flyway:${tag}`,
                resources: {
                  requests: { cpu: '100m', memory: '128Mi' },
                  limits: { cpu: '500m', memory: '256Mi' },
                },
                command: ['flyway', 'migrate'],
                env: [
                  { name: 'FLYWAY_URL', valueFrom: { secretKeyRef: { name: 'database', key: 'url' } } },
                  { name: 'FLYWAY_USER', valueFrom: { secretKeyRef: { name: 'database', key: 'username' } } },
                  { name: 'FLYWAY_PASSWORD', valueFrom: { secretKeyRef: { name: 'database', key: 'password' } } },
                ],
              },
            ],
            containers: [containerSpec],
            volumes: [
              {
                name: 'loculus-ena-submission-config-volume',
                configMap: { name: 'loculus-ena-submission-config' },
              },
            ],
          },
        },
      },
    });
  }

  private createCronJob(values: LoculusValues, tag: string): void {
    const containerSpec: any = {
      name: 'ena-submission',
      image: `ghcr.io/loculus-project/ena-submission:${tag}`,
      imagePullPolicy: values.imagePullPolicy,
      env: [
        {
          name: 'EXTERNAL_METADATA_UPDATER_PASSWORD',
          valueFrom: { secretKeyRef: { name: 'service-accounts', key: 'externalMetadataUpdaterPassword' } },
        },
        { name: 'DB_URL', valueFrom: { secretKeyRef: { name: 'database', key: 'url' } } },
        { name: 'DB_USERNAME', valueFrom: { secretKeyRef: { name: 'database', key: 'username' } } },
        { name: 'DB_PASSWORD', valueFrom: { secretKeyRef: { name: 'database', key: 'password' } } },
        { name: 'SLACK_HOOK', valueFrom: { secretKeyRef: { name: 'slack-notifications', key: 'slack-hook' } } },
        { name: 'SLACK_TOKEN', valueFrom: { secretKeyRef: { name: 'slack-notifications', key: 'slack-token' } } },
        {
          name: 'SLACK_CHANNEL_ID',
          valueFrom: { secretKeyRef: { name: 'slack-notifications', key: 'slack-channel-id' } },
        },
      ],
      args: ['python', 'scripts/get_ena_submission_list.py', '--config-file=/config/config.yaml'],
      volumeMounts: [
        { name: 'loculus-ena-submission-config-volume', mountPath: '/config/config.yaml', subPath: 'config.yaml' },
      ],
    };

    const cronResources = getResources('ena-submission-list-cronjob', values);
    if (cronResources) Object.assign(containerSpec, cronResources);

    new ApiObject(this, 'cronjob', {
      apiVersion: 'batch/v1',
      kind: 'CronJob',
      metadata: { name: 'loculus-get-ena-submission-list-cronjob' },
      spec: {
        schedule: '0 1,13 * * *',
        startingDeadlineSeconds: 60,
        concurrencyPolicy: 'Forbid',
        jobTemplate: {
          spec: {
            activeDeadlineSeconds: values.getSubmissionListLimitSeconds,
            template: {
              metadata: {
                labels: { app: 'loculus', component: 'loculus-get-ena-submission-list-cronjob' },
                annotations: { 'argocd.argoproj.io/sync-options': 'Replace=true' },
              },
              spec: {
                ...priorityClassName(values),
                restartPolicy: 'Never',
                containers: [containerSpec],
                volumes: [
                  {
                    name: 'loculus-ena-submission-config-volume',
                    configMap: { name: 'loculus-ena-submission-config' },
                  },
                ],
              },
            },
          },
        },
      },
    });
  }

  private createService(values: LoculusValues): void {
    const portSpec: any = {
      port: 5000,
      targetPort: 5000,
      protocol: 'TCP',
      name: 'http',
    };
    if (values.environment !== 'server') {
      portSpec.nodePort = 30050;
    }

    new ApiObject(this, 'service', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: 'loculus-ena-submission-service' },
      spec: {
        type: serviceType(values),
        selector: { app: 'loculus', component: 'loculus-ena-submission' },
        ports: [portSpec],
      },
    });
  }
}
