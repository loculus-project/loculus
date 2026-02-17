import { Construct } from 'constructs';
import { ApiObject } from 'cdk8s';
import { LoculusValues } from '../values';
import { dockerTag } from '../docker-tag';
import { configProcessorContainer, configVolumes } from '../config-processor';
import { getResources, serviceType, priorityClassName } from '../resources';
import { keycloakUrl } from '../urls';

export class Keycloak extends Construct {
  constructor(scope: Construct, id: string, values: LoculusValues) {
    super(scope, id);

    const tag = dockerTag(values);

    // ConfigMap
    this.createConfigMap(values, tag);

    // Deployment
    this.createDeployment(values, tag);

    // Service
    this.createService(values);

    // Database (if dev)
    if (values.runDevelopmentKeycloakDatabase) {
      this.createDatabase(values, tag);
      this.createDatabaseService(values);
    }
  }

  private createConfigMap(values: LoculusValues, tag: string): void {
    const kcUrl = keycloakUrl(values);
    const config = this.generateKeycloakRealmConfig(values, kcUrl);

    new ApiObject(this, 'config', {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'keycloak-config' },
      data: {
        'keycloak-config.json': JSON.stringify(config, null, 2),
      },
    });
  }

  private generateKeycloakRealmConfig(values: LoculusValues, kcUrl: string): any {
    const config: any = {
      realm: 'loculus',
      enabled: true,
      verifyEmail: values.auth.verifyEmail,
      resetPasswordAllowed: values.auth.resetPasswordAllowed,
    };

    if (values.auth.verifyEmail && values.auth.smtp) {
      config.smtpServer = {
        host: values.auth.smtp.host,
        port: values.auth.smtp.port,
        from: values.auth.smtp.from,
        fromDisplayName: values.name,
        replyTo: values.auth.smtp.replyTo,
        replyToDisplayName: values.name,
        envelopeFrom: values.auth.smtp.envelopeFrom,
        ssl: 'false',
        starttls: 'true',
        auth: 'true',
        user: values.auth.smtp.user,
        password: '[[smtpPassword]]',
      };
    }

    config.registrationAllowed = values.auth.registrationAllowed;
    config.accessTokenLifespan = 36000;
    config.ssoSessionIdleTimeout = 36000;
    config.actionTokenGeneratedByUserLifespan = 1800;

    // Users
    const users: any[] = [];

    if (values.createTestAccounts) {
      const browsers = ['firefox', 'webkit', 'chromium'];
      for (const browser of browsers) {
        for (let i = 0; i < 20; i++) {
          users.push({
            username: `testuser_${i}_${browser}`,
            enabled: true,
            email: `testuser_${i}_${browser}@void.o`,
            emailVerified: true,
            firstName: `${i}_${browser}`,
            lastName: 'TestUser',
            credentials: [{ type: 'password', value: `testuser_${i}_${browser}` }],
            realmRoles: ['user', 'offline_access'],
            attributes: { university: 'University of Test' },
            clientRoles: { account: ['manage-account'] },
          });
        }
      }
      users.push(
        {
          username: 'testuser',
          enabled: true,
          email: 'testuser@void.o',
          emailVerified: true,
          firstName: 'Test',
          lastName: 'User',
          credentials: [{ type: 'password', value: 'testuser' }],
          realmRoles: ['user', 'offline_access'],
          attributes: { university: 'University of Test' },
          clientRoles: { account: ['manage-account'] },
        },
        {
          username: 'superuser',
          enabled: true,
          email: 'superuser@void.o',
          emailVerified: true,
          firstName: 'Dummy',
          lastName: 'SuperUser',
          credentials: [{ type: 'password', value: 'superuser' }],
          realmRoles: ['super_user', 'offline_access'],
          attributes: { university: 'University of Test' },
          clientRoles: { account: ['manage-account'] },
        },
      );
    }

    // System users (always present)
    users.push(
      {
        username: 'insdc_ingest_user',
        enabled: true,
        email: 'insdc_ingest_user@void.o',
        emailVerified: true,
        firstName: 'INSDC Ingest',
        lastName: 'User',
        credentials: [{ type: 'password', value: '[[insdcIngestUserPassword]]' }],
        realmRoles: ['user', 'offline_access'],
        attributes: { university: 'University of Test' },
        clientRoles: { account: ['manage-account'] },
      },
      {
        username: 'preprocessing_pipeline',
        enabled: true,
        email: 'preprocessing_pipeline@void.o',
        emailVerified: true,
        firstName: 'Dummy',
        lastName: 'Preprocessing',
        credentials: [{ type: 'password', value: '[[preprocessingPipelinePassword]]' }],
        realmRoles: ['preprocessing_pipeline', 'offline_access'],
        attributes: { university: 'University of Test' },
        clientRoles: { account: ['manage-account'] },
      },
      {
        username: 'external_metadata_updater',
        enabled: true,
        email: 'external_metadata_updater@void.o',
        emailVerified: true,
        firstName: 'Dummy',
        lastName: 'INSDC',
        credentials: [{ type: 'password', value: '[[externalMetadataUpdaterPassword]]' }],
        realmRoles: ['external_metadata_updater', 'get_released_data', 'offline_access'],
        attributes: { university: 'University of Test' },
        clientRoles: { account: ['manage-account'] },
      },
      {
        username: 'backend',
        enabled: true,
        email: 'nothing@void.o',
        emailVerified: true,
        firstName: 'Backend',
        lastName: 'Technical-User',
        attributes: { university: 'University of Test' },
        credentials: [{ type: 'password', value: '[[backendUserPassword]]' }],
        clientRoles: {
          'realm-management': ['view-users'],
          account: ['manage-account'],
        },
      },
    );

    config.users = users;

    config.roles = {
      realm: [
        { name: 'user', description: 'User privileges' },
        { name: 'admin', description: 'Administrator privileges' },
        { name: 'preprocessing_pipeline', description: 'Preprocessing pipeline privileges' },
        { name: 'external_metadata_updater', description: 'External Submitter privileges' },
        { name: 'get_released_data', description: 'Privileges for getting released data' },
        { name: 'super_user', description: 'Privileges for curators to modify sequence entries of any user' },
      ],
    };

    config.clients = [
      {
        clientId: 'backend-client',
        enabled: true,
        publicClient: true,
        directAccessGrantsEnabled: true,
        redirectUris: [`https://${values.host || ''}/*`, `http://${values.host || ''}/*`, 'http://localhost:3000/*'],
      },
      {
        clientId: 'account-console2',
        name: '${client_account-console}',
        description: '',
        rootUrl: '${authBaseUrl}',
        adminUrl: '',
        baseUrl: '/realms/loculus/account/',
        surrogateAuthRequired: false,
        enabled: true,
        alwaysDisplayInConsole: false,
        clientAuthenticatorType: 'client-secret',
        redirectUris: ['/realms/loculus/account/*'],
        webOrigins: ['+'],
        notBefore: 0,
        bearerOnly: false,
        consentRequired: false,
        standardFlowEnabled: true,
        implicitFlowEnabled: false,
        directAccessGrantsEnabled: false,
        serviceAccountsEnabled: false,
        publicClient: true,
        frontchannelLogout: false,
        protocol: 'openid-connect',
        attributes: {
          'oidc.ciba.grant.enabled': 'false',
          'backchannel.logout.session.required': 'true',
          'post.logout.redirect.uris': '+',
          'oauth2.device.authorization.grant.enabled': 'false',
          'display.on.consent.screen': 'false',
          'pkce.code.challenge.method': 'S256',
          'backchannel.logout.revoke.offline.tokens': 'false',
        },
        authenticationFlowBindingOverrides: {},
        fullScopeAllowed: false,
        nodeReRegistrationTimeout: 0,
        protocolMappers: [
          {
            name: 'audience resolve',
            protocol: 'openid-connect',
            protocolMapper: 'oidc-audience-resolve-mapper',
            consentRequired: false,
            config: {},
          },
        ],
        defaultClientScopes: ['web-origins', 'acr', 'profile', 'roles', 'email'],
        optionalClientScopes: ['address', 'phone', 'offline_access', 'microprofile-jwt'],
      },
    ];

    config.attributes = {
      frontendUrl: kcUrl,
      userProfileEnabled: 'true',
    };

    config.components = {
      'org.keycloak.userprofile.UserProfileProvider': [
        {
          providerId: 'declarative-user-profile',
          subComponents: {},
          config: {
            'kc.user.profile.config': [
              '{"attributes":[{"name":"username","displayName":"${username}","validations":{"length":{"min":3,"max":255},"username-prohibited-characters":{},"up-username-not-idn-homograph":{}},"permissions":{"view":["admin","user"],"edit":["admin","user"]}},{"name":"email","displayName":"${email}","validations":{"email":{},"length":{"max":255}},"required":{"roles":["user"]},"permissions":{"view":["admin","user"],"edit":["admin","user"]}},{"name":"firstName","displayName":"${firstName}","validations":{"length":{"max":255},"person-name-prohibited-characters":{}},"required":{"roles":["user"]},"permissions":{"view":["admin","user"],"edit":["admin","user"]}},{"name":"lastName","displayName":"${lastName}","validations":{"length":{"max":255},"person-name-prohibited-characters":{}},"required":{"roles":["user"]},"permissions":{"view":["admin","user"],"edit":["admin","user"]}},{"name":"university","displayName":"University / Organisation","validations":{},"annotations":{},"required":{"roles":["admin","user"]},"permissions":{"view":[],"edit":["admin","user"]}},{"name":"orcid","displayName":"","permissions":{"edit":["admin"],"view":["admin","user"]},"annotations":{},"validations":{}}],"groups":[]}',
            ],
          },
        },
      ],
    };

    config.loginTheme = 'loculus';
    config.emailTheme = 'loculus';

    // Identity providers
    const identityProviders: any[] = [];
    const identityProviderMappers: any[] = [];
    if (values.auth.identityProviders) {
      for (const [key, value] of Object.entries(values.auth.identityProviders)) {
        if (key === 'orcid') {
          identityProviders.push({
            alias: 'orcid',
            providerId: 'orcid',
            enabled: true,
            updateProfileFirstLoginMode: 'on',
            trustEmail: false,
            storeToken: false,
            addReadTokenRoleOnCreate: false,
            authenticateByDefault: false,
            linkOnly: false,
            firstBrokerLoginFlowAlias: 'first broker login',
            config: {
              clientSecret: '[[orcidSecret]]',
              clientId: (value as any).clientId,
            },
          });
          identityProviderMappers.push(
            {
              name: 'username mapper',
              identityProviderAlias: 'orcid',
              identityProviderMapper: 'hardcoded-attribute-idp-mapper',
              config: { syncMode: 'IMPORT', attribute: 'username' },
            },
            {
              name: 'orcid',
              identityProviderAlias: 'orcid',
              identityProviderMapper: 'orcid-user-attribute-mapper',
              config: { syncMode: 'INHERIT', jsonField: 'orcid-identifier', userAttribute: 'orcid.path' },
            },
          );
        }
      }
    }
    config.identityProviders = identityProviders;
    config.identityProviderMappers = identityProviderMappers;

    return config;
  }

  private createDeployment(values: LoculusValues, tag: string): void {
    const kcUrl = keycloakUrl(values);
    const env: any[] = [
      { name: 'REGISTRATION_TERMS_MESSAGE', value: (values.registrationTermsMessage || '').trimEnd() },
      { name: 'PROJECT_NAME', value: values.name },
      { name: 'KC_DB', value: 'postgres' },
      { name: 'KC_DB_URL_HOST', valueFrom: { secretKeyRef: { name: 'keycloak-database', key: 'addr' } } },
      { name: 'KC_DB_URL_PORT', valueFrom: { secretKeyRef: { name: 'keycloak-database', key: 'port' } } },
      { name: 'KC_DB_URL_DATABASE', valueFrom: { secretKeyRef: { name: 'keycloak-database', key: 'database' } } },
      { name: 'KC_DB_USERNAME', valueFrom: { secretKeyRef: { name: 'keycloak-database', key: 'username' } } },
      { name: 'KC_DB_PASSWORD', valueFrom: { secretKeyRef: { name: 'keycloak-database', key: 'password' } } },
      { name: 'KC_BOOTSTRAP_ADMIN_USERNAME', value: 'admin' },
      {
        name: 'KC_BOOTSTRAP_ADMIN_PASSWORD',
        valueFrom: { secretKeyRef: { name: 'keycloak-admin', key: 'initialAdminPassword' } },
      },
      { name: 'KEYCLOAK_ADMIN', value: 'admin' },
      {
        name: 'KEYCLOAK_ADMIN_PASSWORD',
        valueFrom: { secretKeyRef: { name: 'keycloak-admin', key: 'initialAdminPassword' } },
      },
      { name: 'KC_PROXY', value: 'edge' },
      { name: 'PROXY_ADDRESS_FORWARDING', value: 'true' },
      { name: 'KC_HEALTH_ENABLED', value: 'true' },
      { name: 'KC_HOSTNAME_URL', value: kcUrl },
      { name: 'KC_HOSTNAME_ADMIN_URL', value: kcUrl },
      { name: 'KC_FEATURES', value: 'declarative-user-profile' },
      { name: 'KC_RUN_IN_CONTAINER', value: 'true' },
    ];

    if (values.runDevelopmentKeycloakDatabase) {
      env.push({ name: 'LOCULUS_VERSION', value: tag });
    }

    const containerSpec: any = {
      name: 'keycloak',
      image: 'quay.io/keycloak/keycloak:23.0',
      env,
      args: ['start', '--import-realm', '--cache=local'],
      ports: [{ containerPort: 8080 }],
      volumeMounts: [
        { name: 'keycloak-config-processed', mountPath: '/opt/keycloak/data/import/' },
        { name: 'theme-volume', mountPath: '/opt/keycloak/providers/' },
      ],
      startupProbe: {
        httpGet: { path: '/health/ready', port: 8080 },
        timeoutSeconds: 3,
        failureThreshold: 150,
        periodSeconds: 5,
      },
      livenessProbe: {
        httpGet: { path: '/health/ready', port: 8080 },
        timeoutSeconds: 3,
        periodSeconds: 10,
        failureThreshold: 2,
      },
    };

    const resources = getResources('keycloak', values);
    if (resources) Object.assign(containerSpec, resources);

    const spec: any = {
      ...priorityClassName(values),
      initContainers: [
        configProcessorContainer('keycloak-config', tag, values.imagePullPolicy),
        {
          name: 'keycloak-theme-prep',
          resources: {
            requests: { cpu: '100m', memory: '128Mi' },
            limits: { cpu: '500m', memory: '256Mi' },
          },
          image: `ghcr.io/loculus-project/keycloakify:${tag}`,
          volumeMounts: [{ name: 'theme-volume', mountPath: '/destination' }],
        },
      ],
      containers: [containerSpec],
      volumes: [...configVolumes('keycloak-config'), { name: 'theme-volume', emptyDir: {} }],
    };

    new ApiObject(this, 'deployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'loculus-keycloak',
        annotations: { 'argocd.argoproj.io/sync-options': 'Replace=true' },
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'loculus', component: 'keycloak' } },
        template: {
          metadata: { labels: { app: 'loculus', component: 'keycloak' } },
          spec,
        },
      },
    });
  }

  private createService(values: LoculusValues): void {
    const portSpec: any = {
      port: 8083,
      targetPort: 8080,
      protocol: 'TCP',
      name: 'http',
    };
    if (values.environment !== 'server') {
      portSpec.nodePort = 30083;
    }

    new ApiObject(this, 'service', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: 'loculus-keycloak-service' },
      spec: {
        type: serviceType(values),
        selector: { app: 'loculus', component: 'keycloak' },
        ports: [portSpec],
      },
    });
  }

  private createDatabase(values: LoculusValues, tag: string): void {
    const env: any[] = [
      { name: 'POSTGRES_USER', value: 'postgres' },
      { name: 'POSTGRES_PASSWORD', value: 'unsecure' },
      { name: 'POSTGRES_DB', value: 'keycloak' },
      { name: 'POSTGRES_HOST_AUTH_METHOD', value: 'trust' },
    ];
    if (!values.developmentDatabasePersistence) {
      env.push({ name: 'LOCULUS_VERSION', value: tag });
    }

    new ApiObject(this, 'db-deployment', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'loculus-keycloak-database',
        annotations: { 'argocd.argoproj.io/sync-options': 'Replace=true' },
      },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'loculus', component: 'keycloak-database' } },
        strategy: { type: 'Recreate' },
        template: {
          metadata: {
            annotations: { timestamp: new Date().toISOString() },
            labels: { app: 'loculus', component: 'keycloak-database' },
          },
          spec: {
            containers: [
              {
                name: 'loculus-keycloak-database',
                image: 'postgres:15.12',
                resources: {
                  requests: { memory: '30Mi', cpu: '10m' },
                  limits: { memory: '100Mi' },
                },
                ports: [{ containerPort: 5432 }],
                env,
              },
            ],
          },
        },
      },
    });
  }

  private createDatabaseService(_values: LoculusValues): void {
    new ApiObject(this, 'db-service', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: 'loculus-keycloak-database-service' },
      spec: {
        type: 'ClusterIP',
        selector: { app: 'loculus', component: 'keycloak-database' },
        ports: [{ port: 5432 }],
      },
    });
  }
}
