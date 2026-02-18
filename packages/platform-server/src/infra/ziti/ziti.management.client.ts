import { Logger } from '@nestjs/common';
import { Agent, fetch } from 'undici';

import type {
  ZitiEdgeRouter,
  ZitiEdgeRouterPolicy,
  ZitiEnrollment,
  ZitiIdentity,
  ZitiService,
  ZitiServicePolicy,
} from './ziti.types';

type RequestOptions = {
  body?: unknown;
  searchParams?: Record<string, string>;
  auth?: boolean;
};

type Envelope<T> = {
  data: T;
};

type ListEnvelope<T> = {
  data: T[];
};

type AuthenticationResponse = {
  token: string;
};

export type ZitiManagementClientOptions = {
  baseUrl: string;
  username: string;
  password: string;
  insecureTls: boolean;
};

type ZitiServiceCreate = Partial<ZitiService> & {
  name: string;
  encryptionRequired?: boolean;
  terminatorStrategy?: string;
};

export class ZitiManagementClient {
  private readonly logger = new Logger(ZitiManagementClient.name);
  private readonly dispatcher: Agent;
  private sessionToken?: string;

  constructor(private readonly options: ZitiManagementClientOptions) {
    this.dispatcher = new Agent({
      connect: {
        rejectUnauthorized: !options.insecureTls,
      },
    });
  }

  async close(): Promise<void> {
    await this.dispatcher.close();
  }

  async authenticate(): Promise<void> {
    const response = await this.request<Envelope<AuthenticationResponse>>('POST', '/authenticate', {
      auth: false,
      searchParams: { method: 'password' },
      body: {
        username: this.options.username,
        password: this.options.password,
      },
    });
    if (!response?.data?.token) {
      throw new Error('Failed to authenticate against Ziti controller');
    }
    this.sessionToken = response.data.token;
  }

  async getServiceByName(name: string): Promise<ZitiService | undefined> {
    return this.findByName<ZitiService>('/services', name);
  }

  async createService(payload: ZitiServiceCreate): Promise<ZitiService> {
    const response = await this.request<Envelope<ZitiService>>('POST', '/services', { body: payload });
    return response.data;
  }

  async updateService(id: string, payload: Partial<ZitiService>): Promise<ZitiService> {
    const response = await this.request<Envelope<ZitiService>>('PATCH', `/services/${id}`, { body: payload });
    return response.data;
  }

  async getServicePolicyByName(name: string): Promise<ZitiServicePolicy | undefined> {
    return this.findByName<ZitiServicePolicy>('/service-policies', name);
  }

  async createServicePolicy(payload: Omit<ZitiServicePolicy, 'id'>): Promise<ZitiServicePolicy> {
    const response = await this.request<Envelope<ZitiServicePolicy>>('POST', '/service-policies', { body: payload });
    return response.data;
  }

  async updateServicePolicy(id: string, payload: Partial<ZitiServicePolicy>): Promise<ZitiServicePolicy> {
    const response = await this.request<Envelope<ZitiServicePolicy>>('PATCH', `/service-policies/${id}`, {
      body: payload,
    });
    return response.data;
  }

  async getServiceEdgeRouterPolicyByName(name: string): Promise<ZitiEdgeRouterPolicy | undefined> {
    return this.findByName<ZitiEdgeRouterPolicy>('/service-edge-router-policies', name);
  }

  async createServiceEdgeRouterPolicy(
    payload: Omit<ZitiEdgeRouterPolicy, 'id'>,
  ): Promise<ZitiEdgeRouterPolicy> {
    const response = await this.request<Envelope<ZitiEdgeRouterPolicy>>('POST', '/service-edge-router-policies', {
      body: payload,
    });
    return response.data;
  }

  async updateServiceEdgeRouterPolicy(
    id: string,
    payload: Partial<ZitiEdgeRouterPolicy>,
  ): Promise<ZitiEdgeRouterPolicy> {
    const response = await this.request<Envelope<ZitiEdgeRouterPolicy>>('PATCH', `/service-edge-router-policies/${id}`, {
      body: payload,
    });
    return response.data;
  }

  async getEdgeRouterByName(name: string): Promise<ZitiEdgeRouter | undefined> {
    return this.findByName<ZitiEdgeRouter>('/edge-routers', name);
  }

  async updateEdgeRouter(id: string, payload: Partial<ZitiEdgeRouter>): Promise<ZitiEdgeRouter> {
    const response = await this.request<Envelope<ZitiEdgeRouter>>('PATCH', `/edge-routers/${id}`, { body: payload });
    return response.data;
  }

  async getIdentityByName(name: string): Promise<ZitiIdentity | undefined> {
    return this.findByName<ZitiIdentity>('/identities', name);
  }

  async createIdentity(payload: Omit<ZitiIdentity, 'id'> & { type: string; isAdmin: boolean }): Promise<ZitiIdentity> {
    const response = await this.request<Envelope<ZitiIdentity>>('POST', '/identities', { body: payload });
    return response.data;
  }

  async updateIdentity(id: string, payload: Partial<ZitiIdentity>): Promise<ZitiIdentity> {
    const response = await this.request<Envelope<ZitiIdentity>>('PATCH', `/identities/${id}`, { body: payload });
    return response.data;
  }

  async listIdentityEnrollments(identityId: string): Promise<ZitiEnrollment[]> {
    const response = await this.request<ListEnvelope<ZitiEnrollment>>(
      'GET',
      `/identities/${identityId}/enrollments`,
      {},
    );
    return response.data;
  }

  async createEnrollment(payload: {
    identityId: string;
    method: 'ott';
    expiresAt: string;
  }): Promise<ZitiEnrollment> {
    const response = await this.request<Envelope<ZitiEnrollment>>('POST', '/enrollments', { body: payload });
    return response.data;
  }

  private async findByName<T>(path: string, name: string): Promise<T | undefined> {
    const filter = this.buildNameFilter(name);
    const response = await this.request<ListEnvelope<T>>('GET', path, {
      searchParams: { filter },
    });
    return response.data?.[0];
  }

  private buildNameFilter(name: string): string {
    const escaped = name.replace(/"/g, '\\"');
    return `name="${escaped}"`;
  }

  private async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(path, this.options.baseUrl);
    if (options.searchParams) {
      for (const [key, value] of Object.entries(options.searchParams)) {
        if (typeof value === 'string' && value.length > 0) {
          url.searchParams.set(key, value);
        }
      }
    }

    const headers: Record<string, string> = {};
    let body: string | undefined;
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    const shouldAuth = options.auth !== false;
    if (shouldAuth) {
      if (!this.sessionToken) {
        throw new Error('Ziti session token missing; call authenticate() first');
      }
      headers['zt-session'] = this.sessionToken;
    }

    const response = await fetch(url, {
      method,
      body,
      headers,
      dispatcher: this.dispatcher,
    });

    if (!response.ok) {
      const details = await this.safeReadError(response);
      throw new Error(`Ziti management request failed (${response.status} ${response.statusText}): ${details}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  private async safeReadError(response: Response): Promise<string> {
    try {
      const body = await response.text();
      return body || 'no body';
    } catch (error) {
      this.logger.warn({ error }, 'failed to read Ziti error payload');
      return 'unavailable';
    }
  }
}
