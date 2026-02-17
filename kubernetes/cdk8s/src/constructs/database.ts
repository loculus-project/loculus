import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { LoculusValues } from '../values';
import { dockerTag } from '../docker-tag';
import { serviceType } from '../resources';

export class Database extends Construct {
  constructor(scope: Construct, id: string, values: LoculusValues) {
    super(scope, id);

    if (!values.runDevelopmentMainDatabase) return;

    const tag = dockerTag(values);
    const env: any[] = [
      { name: 'POSTGRES_USER', value: 'postgres' },
      { name: 'POSTGRES_PASSWORD', value: 'unsecure' },
      { name: 'POSTGRES_DB', value: 'loculus' },
      { name: 'POSTGRES_HOST_AUTH_METHOD', value: 'trust' },
    ];
    if (!values.developmentDatabasePersistence) {
      env.push({ name: 'LOCULUS_VERSION', value: tag });
    }

    new ApiObject(this, 'deployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'loculus-database',
        annotations: { 'argocd.argoproj.io/sync-options': 'Replace=true' },
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'loculus', component: 'database' } },
        strategy: { type: 'Recreate' },
        template: {
          metadata: { labels: { app: 'loculus', component: 'database' } },
          spec: {
            containers: [
              {
                name: 'database',
                image: 'postgres:15.12',
                args: ['-c', 'shared_preload_libraries=pg_stat_statements', '-c', 'pg_stat_statements.track=all'],
                resources: {
                  requests: { memory: '200Mi', cpu: '250m' },
                  limits: { memory: '2Gi' },
                },
                ports: [{ containerPort: 5432 }],
                env,
                volumeMounts: [{ name: 'init-scripts', mountPath: '/docker-entrypoint-initdb.d' }],
              },
            ],
            volumes: [{ name: 'init-scripts', configMap: { name: 'loculus-database-init' } }],
          },
        },
      },
    });

    new ApiObject(this, 'init-configmap', {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'loculus-database-init' },
      data: {
        'init-pg-stat.sql': 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements;\n',
      },
    });

    const portSpec: any = {
      port: 5432,
      targetPort: 5432,
      protocol: 'TCP',
      name: 'http',
    };
    if (values.environment !== 'server') {
      portSpec.nodePort = 30432;
    }

    new ApiObject(this, 'service', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: 'loculus-database-service' },
      spec: {
        type: serviceType(values),
        selector: { app: 'loculus', component: 'database' },
        ports: [portSpec],
      },
    });
  }
}
