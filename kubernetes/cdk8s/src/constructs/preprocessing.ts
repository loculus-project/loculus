import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { LoculusValues, EnabledOrganism } from '../values';
import { dockerTag } from '../docker-tag';
import { getResources, priorityClassName } from '../resources';
import { patchMetadataSchema, flattenPreprocessingVersions, mergeReferenceGenomes } from '../organisms';
import { generatePreprocessingSpecs } from '../config-generation';
import * as yaml from 'js-yaml';

export class Preprocessing extends Construct {
  constructor(scope: Construct, id: string, values: LoculusValues, organism: EnabledOrganism) {
    super(scope, id);

    if (values.disablePreprocessing) return;

    const tag = dockerTag(values);
    const orgKey = organism.key;
    const organismContent = organism.contents;
    const testconfig = values.testconfig || false;

    const backendHost = values.disableBackend ? 'http://host.k3d.internal:8079' : 'http://loculus-backend-service:8079';

    const keycloakHost = testconfig ? `http://${values.localHost}:8083` : 'http://loculus-keycloak-service:8083';

    const patchedSchema = patchMetadataSchema(organismContent.schema);
    const metadata = patchedSchema.metadata;
    const flattened = flattenPreprocessingVersions(organismContent.preprocessing);

    for (let processingIndex = 0; processingIndex < flattened.length; processingIndex++) {
      const pc = flattened[processingIndex];
      const thisDockerTag = pc.dockerTag || tag;
      const replicas = pc.replicas || 1;
      const deploymentName = `loculus-preprocessing-${orgKey}-v${pc.version}-${processingIndex}`;

      // ConfigMap (only if configFile exists)
      if (pc.configFile) {
        const preprocessingSpecs = generatePreprocessingSpecs(metadata, organismContent.referenceGenomes);
        const configData: any = {
          organism: orgKey,
          ...pc.configFile,
          processing_spec: {
            ...preprocessingSpecs,
            versionComment: {
              function: 'identity',
              inputs: { input: 'versionComment' },
              args: null,
            },
          },
        };

        new ApiObject(this, `config-${processingIndex}`, {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name: `loculus-preprocessing-config-${orgKey}-v${pc.version}-${processingIndex}` },
          data: {
            'preprocessing-config.yaml': yaml.dump(configData),
          },
        });
      }

      // Deployment
      const containerArgs: string[] = [...(pc.args || [])];
      containerArgs.push(
        `--backend-host=${backendHost}/${orgKey}`,
        `--keycloak-host=${keycloakHost}`,
        `--pipeline-version=${pc.version}`,
        '--keycloak-password=$(KEYCLOAK_PASSWORD)',
      );

      const containerSpec: any = {
        name: `preprocessing-${orgKey}`,
        image: `${pc.image}:${thisDockerTag}`,
        imagePullPolicy: values.imagePullPolicy,
        env: [
          {
            name: 'KEYCLOAK_PASSWORD',
            valueFrom: { secretKeyRef: { name: 'service-accounts', key: 'preprocessingPipelinePassword' } },
          },
        ],
        args: containerArgs,
      };

      const resources = getResources('preprocessing', values);
      if (resources) Object.assign(containerSpec, resources);

      const podSpec: any = {
        ...priorityClassName(values),
        containers: [containerSpec],
      };

      if (pc.configFile) {
        containerSpec.args.push('--config=/etc/config/preprocessing-config.yaml');
        containerSpec.volumeMounts = [
          {
            name: `preprocessing-config-volume-${orgKey}-v${pc.version}-${processingIndex}`,
            mountPath: '/etc/config',
          },
        ];
        podSpec.volumes = [
          {
            name: `preprocessing-config-volume-${orgKey}-v${pc.version}-${processingIndex}`,
            configMap: { name: `loculus-preprocessing-config-${orgKey}-v${pc.version}-${processingIndex}` },
          },
        ];
      }

      new ApiObject(this, `deployment-${processingIndex}`, {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: deploymentName,
          annotations: { 'argocd.argoproj.io/sync-options': 'Replace=true' },
        },
        spec: {
          replicas,
          selector: { matchLabels: { app: 'loculus', component: deploymentName } },
          template: {
            metadata: {
              annotations: { timestamp: new Date().toISOString() },
              labels: { app: 'loculus', component: deploymentName },
            },
            spec: podSpec,
          },
        },
      });
    }
  }
}
