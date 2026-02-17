import { Chart } from 'cdk8s';
import { Construct } from 'constructs';
import { LoculusValues } from './values';
import { getEnabledOrganisms } from './organisms';

import { Secrets } from './constructs/secrets';
import { Database } from './constructs/database';
import { Minio } from './constructs/minio';
import { Keycloak } from './constructs/keycloak';
import { Backend } from './constructs/backend';
import { Website } from './constructs/website';
import { Silo } from './constructs/silo';
import { Lapis, LapisIngress } from './constructs/lapis';
import { Preprocessing } from './constructs/preprocessing';
import { Ingest } from './constructs/ingest';
import { EnaSubmission } from './constructs/ena-submission';
import { Docs } from './constructs/docs';
import { MainIngress } from './constructs/ingress';

export class LoculusChart extends Chart {
  constructor(scope: Construct, id: string, values: LoculusValues) {
    super(scope, id);

    // Secrets
    new Secrets(this, 'secrets', values);

    // Core infrastructure
    new Database(this, 'database', values);
    new Minio(this, 'minio', values);
    new Keycloak(this, 'keycloak', values);

    // Main services
    new Backend(this, 'backend', values);
    new Website(this, 'website', values);

    // Per-organism services
    const organisms = getEnabledOrganisms(values);
    for (const org of organisms) {
      new Silo(this, `silo-${org.key}`, values, org);
      new Lapis(this, `lapis-${org.key}`, values, org);
      new Preprocessing(this, `prepro-${org.key}`, values, org);
      new Ingest(this, `ingest-${org.key}`, values, org);
    }

    // LAPIS shared ingress (always created - handles local and server)
    new LapisIngress(this, 'lapis-ingress', values);

    // Optional services
    new EnaSubmission(this, 'ena-submission', values);
    new Docs(this, 'docs', values);

    // Server-only ingress
    new MainIngress(this, 'main-ingress', values);
  }
}
