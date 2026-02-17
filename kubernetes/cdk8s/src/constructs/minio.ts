import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { LoculusValues } from '../values';
import { dockerTag } from '../docker-tag';
import { getResources, serviceType } from '../resources';

export class Minio extends Construct {
  constructor(scope: Construct, id: string, values: LoculusValues) {
    super(scope, id);

    if (!values.s3.enabled || !values.runDevelopmentS3) return;

    const tag = dockerTag(values);
    const bucketName = values.s3.bucket.bucket;

    // Policy ConfigMap
    new ApiObject(this, 'policies', {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'minio-policies' },
      data: {
        'policy.json': JSON.stringify(
          {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: 's3:GetObject',
                Resource: `arn:aws:s3:::${bucketName}/*`,
                Principal: '*',
                Condition: {
                  StringEquals: { 's3:ExistingObjectTag/public': 'true' },
                },
              },
            ],
          },
          null,
          2,
        ),
      },
    });

    const env: any[] = [
      { name: 'MINIO_ROOT_USER', valueFrom: { secretKeyRef: { name: 's3-bucket', key: 'accessKey' } } },
      { name: 'MINIO_ROOT_PASSWORD', valueFrom: { secretKeyRef: { name: 's3-bucket', key: 'secretKey' } } },
    ];
    if (!values.developmentDatabasePersistence) {
      env.push({ name: 'LOCULUS_VERSION', value: tag });
    }

    const containerSpec: any = {
      name: 'minio',
      image: 'minio/minio:latest',
      args: ['server', '/data'],
      ports: [{ containerPort: 9000 }],
      env,
      lifecycle: {
        postStart: {
          exec: {
            command: [
              '/bin/sh',
              '-c',
              `(\n  sleep 10\n  mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"\n  mc mb -p local/${bucketName}\n  echo "Bucket ${bucketName} ensured."\n  mc anonymous set-json /policy/policy.json local/${bucketName}\n) &\n`,
            ],
          },
        },
      },
      volumeMounts: [{ name: 'policy-volume', mountPath: '/policy' }],
    };

    const resources = getResources('minio', values);
    if (resources) Object.assign(containerSpec, resources);

    new ApiObject(this, 'deployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'minio',
        annotations: { 'argocd.argoproj.io/sync-options': 'Replace=true' },
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'loculus', component: 'minio' } },
        template: {
          metadata: { labels: { app: 'loculus', component: 'minio' } },
          spec: {
            volumes: [{ name: 'policy-volume', configMap: { name: 'minio-policies' } }],
            containers: [containerSpec],
            restartPolicy: 'Always',
          },
        },
      },
    });

    const portSpec: any = {
      port: 8084,
      targetPort: 9000,
      protocol: 'TCP',
      name: 'http',
    };
    if (values.environment !== 'server') {
      portSpec.nodePort = 30084;
    }

    new ApiObject(this, 'service', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: 'loculus-minio-service' },
      spec: {
        type: serviceType(values),
        selector: { app: 'loculus', component: 'minio' },
        ports: [portSpec],
      },
    });
  }
}
