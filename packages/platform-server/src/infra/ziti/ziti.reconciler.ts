import { Injectable, Logger } from '@nestjs/common';

import { ConfigService } from '../../core/services/config.service';
import { ZitiIdentityManager } from './ziti.identity.manager';
import { ZitiManagementClient } from './ziti.management.client';
import type {
  ZitiEdgeRouter,
  ZitiEdgeRouterPolicy,
  ZitiIdentity,
  ZitiIdentityProfile,
  ZitiIdentityRouterPolicy,
  ZitiRuntimeProfile,
  ZitiService,
  ZitiServicePolicy,
} from './ziti.types';

const APP_ATTRIBUTE = 'app.agyn-platform';
const SERVICE_ATTRIBUTE = 'service.platform-api';
const ROUTER_ATTRIBUTE = 'router.platform';
const PLATFORM_ATTRIBUTE = 'component.platform-server';
const RUNNER_ATTRIBUTE = 'component.docker-runner';

@Injectable()
export class ZitiReconciler {
  private readonly logger = new Logger(ZitiReconciler.name);

  constructor(
    private readonly config: ConfigService,
    private readonly identityManager: ZitiIdentityManager,
  ) {}

  async reconcile(): Promise<void> {
    if (!this.config.isZitiEnabled()) {
      this.logger.log('Ziti disabled; skipping controller reconciliation');
      return;
    }

    const profile = this.buildProfile();
    const client = new ZitiManagementClient({
      baseUrl: profile.managementUrl,
      username: profile.username,
      password: profile.password,
      insecureTls: profile.insecureTls,
    });

    try {
      await client.authenticate();
      await this.ensureRouter(client, profile);
      await this.ensureService(client, profile);
      await this.ensureServicePolicies(client, profile);
      await this.ensureEdgeRouterPolicy(client, profile);
      await this.ensureIdentityRouterPolicy(client, profile);

      const platformIdentity = await this.ensureIdentity(client, profile.identities.platform);
      const runnerIdentity = await this.ensureIdentity(client, profile.identities.runner);

      await this.identityManager.ensureIdentityMaterial({
        profile: profile.identities.platform,
        identityId: platformIdentity.id,
        enrollmentTtlSeconds: profile.enrollmentTtlSeconds,
        directories: profile.directories,
        client,
      });

      await this.identityManager.ensureIdentityMaterial({
        profile: profile.identities.runner,
        identityId: runnerIdentity.id,
        enrollmentTtlSeconds: profile.enrollmentTtlSeconds,
        directories: profile.directories,
        client,
      });
    } finally {
      await client.close();
    }
  }

  private buildProfile(): ZitiRuntimeProfile {
    const platformIdentity = this.config.getZitiPlatformIdentity();
    const runnerIdentity = this.config.getZitiRunnerIdentity();
    const directories = {
      identities: this.config.getZitiIdentityDirectory(),
      tmp: this.config.getZitiTmpDirectory(),
    };
    const credentials = this.config.getZitiCredentials();
    return {
      managementUrl: this.config.getZitiManagementUrl(),
      username: credentials.username,
      password: credentials.password,
      insecureTls: this.config.getZitiInsecureTls(),
      serviceName: this.config.getZitiServiceName(),
      serviceRoleAttributes: [APP_ATTRIBUTE, SERVICE_ATTRIBUTE],
      serviceSelectors: [`#${SERVICE_ATTRIBUTE}`],
      routerName: this.config.getZitiRouterName(),
      routerRoleAttributes: [ROUTER_ATTRIBUTE],
      routerSelectors: [`#${ROUTER_ATTRIBUTE}`],
      enrollmentTtlSeconds: this.config.getZitiEnrollmentTtlSeconds(),
      directories,
      runnerProxy: {
        host: this.config.getZitiRunnerProxyHost(),
        port: this.config.getZitiRunnerProxyPort(),
      },
      identities: {
        platform: {
          name: platformIdentity.name,
          file: platformIdentity.file,
          roleAttributes: [APP_ATTRIBUTE, PLATFORM_ATTRIBUTE],
          selectors: [`#${PLATFORM_ATTRIBUTE}`],
        },
        runner: {
          name: runnerIdentity.name,
          file: runnerIdentity.file,
          roleAttributes: [APP_ATTRIBUTE, RUNNER_ATTRIBUTE],
          selectors: [`#${RUNNER_ATTRIBUTE}`],
        },
      },
    };
  }

  private async ensureRouter(client: ZitiManagementClient, profile: ZitiRuntimeProfile): Promise<ZitiEdgeRouter> {
    const router = await client.getEdgeRouterByName(profile.routerName);
    if (!router) {
      throw new Error(`Ziti edge router "${profile.routerName}" was not found. Ensure docker-compose is running.`);
    }
    const missingAttrs = profile.routerRoleAttributes.filter((attr) => !router.roleAttributes?.includes(attr));
    if (missingAttrs.length === 0) {
      return router;
    }
    const nextAttributes = Array.from(new Set([...(router.roleAttributes ?? []), ...missingAttrs]));
    this.logger.log(`Updating Ziti router role attributes for ${profile.routerName}`);
    return client.updateEdgeRouter(router.id, { roleAttributes: nextAttributes });
  }

  private async ensureService(client: ZitiManagementClient, profile: ZitiRuntimeProfile): Promise<ZitiService> {
    const existing = await client.getServiceByName(profile.serviceName);
    if (!existing) {
      this.logger.log(`Creating Ziti service ${profile.serviceName}`);
      return client.createService({
        name: profile.serviceName,
        encryptionRequired: true,
        terminatorStrategy: 'smartrouting',
        roleAttributes: profile.serviceRoleAttributes,
      });
    }
    const missingAttrs = profile.serviceRoleAttributes.filter((attr) => !existing.roleAttributes?.includes(attr));
    if (missingAttrs.length === 0) {
      return existing;
    }
    this.logger.log(`Updating Ziti service attributes for ${profile.serviceName}`);
    const nextAttributes = Array.from(new Set([...(existing.roleAttributes ?? []), ...missingAttrs]));
    return client.updateService(existing.id, { roleAttributes: nextAttributes });
  }

  private async ensureServicePolicies(client: ZitiManagementClient, profile: ZitiRuntimeProfile): Promise<void> {
    await this.ensureServicePolicy(client, {
      name: `${profile.serviceName}.dial`,
      type: 'Dial',
      semantic: 'AllOf',
      identityRoles: profile.identities.runner.selectors,
      serviceRoles: profile.serviceSelectors,
    });
    await this.ensureServicePolicy(client, {
      name: `${profile.serviceName}.bind`,
      type: 'Bind',
      semantic: 'AllOf',
      identityRoles: profile.identities.platform.selectors,
      serviceRoles: profile.serviceSelectors,
    });
  }

  private async ensureServicePolicy(
    client: ZitiManagementClient,
    payload: Omit<ZitiServicePolicy, 'id'>,
  ): Promise<ZitiServicePolicy> {
    const existing = await client.getServicePolicyByName(payload.name);
    if (!existing) {
      this.logger.log(`Creating Ziti service policy ${payload.name}`);
      return client.createServicePolicy(payload);
    }

    const needsUpdate =
      existing.type !== payload.type ||
      existing.semantic !== payload.semantic ||
      !this.matches(existing.identityRoles, payload.identityRoles) ||
      !this.matches(existing.serviceRoles, payload.serviceRoles);

    if (!needsUpdate) {
      return existing;
    }

    this.logger.log(`Updating Ziti service policy ${payload.name}`);
    return client.updateServicePolicy(existing.id, payload);
  }

  private async ensureEdgeRouterPolicy(
    client: ZitiManagementClient,
    profile: ZitiRuntimeProfile,
  ): Promise<ZitiEdgeRouterPolicy> {
    const payload: Omit<ZitiEdgeRouterPolicy, 'id'> = {
      name: `${profile.serviceName}.edge-router`,
      semantic: 'AllOf',
      edgeRouterRoles: profile.routerSelectors,
      serviceRoles: profile.serviceSelectors,
    };
    const existing = await client.getServiceEdgeRouterPolicyByName(payload.name);
    if (!existing) {
      this.logger.log(`Creating Ziti edge-router policy ${payload.name}`);
      return client.createServiceEdgeRouterPolicy(payload);
    }
    const needsUpdate =
      existing.semantic !== payload.semantic ||
      !this.matches(existing.edgeRouterRoles, payload.edgeRouterRoles) ||
      !this.matches(existing.serviceRoles, payload.serviceRoles);
    if (!needsUpdate) {
      return existing;
    }
    this.logger.log(`Updating Ziti edge-router policy ${payload.name}`);
    return client.updateServiceEdgeRouterPolicy(existing.id, payload);
  }

  private async ensureIdentityRouterPolicy(
    client: ZitiManagementClient,
    profile: ZitiRuntimeProfile,
  ): Promise<ZitiIdentityRouterPolicy> {
    const identityRoles = Array.from(
      new Set([...profile.identities.platform.selectors, ...profile.identities.runner.selectors]),
    );
    const payload: Omit<ZitiIdentityRouterPolicy, 'id'> = {
      name: `${profile.serviceName}.identities.use-router`,
      semantic: 'AnyOf',
      identityRoles,
      edgeRouterRoles: profile.routerSelectors,
    };
    const existing = await client.getEdgeRouterPolicyByName(payload.name);
    if (!existing) {
      this.logger.log(`Creating Ziti identity-router policy ${payload.name}`);
      return client.createEdgeRouterPolicy(payload);
    }
    const needsUpdate =
      existing.semantic !== payload.semantic ||
      !this.matches(existing.identityRoles, payload.identityRoles) ||
      !this.matches(existing.edgeRouterRoles, payload.edgeRouterRoles);
    if (!needsUpdate) {
      return existing;
    }
    this.logger.log(`Updating Ziti identity-router policy ${payload.name}`);
    return client.updateEdgeRouterPolicy(existing.id, payload);
  }

  private async ensureIdentity(
    client: ZitiManagementClient,
    profile: ZitiIdentityProfile,
  ): Promise<ZitiIdentity> {
    const existing = await client.getIdentityByName(profile.name);
    if (!existing) {
      this.logger.log(`Creating Ziti identity ${profile.name}`);
      return client.createIdentity({
        name: profile.name,
        isAdmin: false,
        type: 'Device',
        roleAttributes: profile.roleAttributes,
      });
    }

    const missingAttrs = profile.roleAttributes.filter((attr) => !existing.roleAttributes?.includes(attr));
    if (missingAttrs.length === 0) {
      return existing;
    }
    this.logger.log(`Updating Ziti identity attributes for ${profile.name}`);
    const nextAttributes = Array.from(new Set([...(existing.roleAttributes ?? []), ...missingAttrs]));
    return client.updateIdentity(existing.id, { roleAttributes: nextAttributes });
  }

  private matches(current: string[] | undefined, desired: string[]): boolean {
    if (!current) return false;
    const currentSet = new Set(current);
    return desired.every((value) => currentSet.has(value));
  }
}
