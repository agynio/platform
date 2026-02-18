export type ZitiIdentityProfile = {
  name: string;
  file: string;
  roleAttributes: string[];
  selectors: string[];
};

export type ZitiRuntimeProfile = {
  managementUrl: string;
  username: string;
  password: string;
  insecureTls: boolean;
  serviceName: string;
  serviceRoleAttributes: string[];
  serviceSelectors: string[];
  routerName: string;
  routerRoleAttributes: string[];
  routerSelectors: string[];
  enrollmentTtlSeconds: number;
  directories: {
    identities: string;
    tmp: string;
  };
  runnerProxy: {
    host: string;
    port: number;
  };
  identities: {
    platform: ZitiIdentityProfile;
    runner: ZitiIdentityProfile;
  };
};

export type ZitiService = {
  id: string;
  name: string;
  roleAttributes: string[];
};

export type ZitiIdentity = {
  id: string;
  name: string;
  roleAttributes: string[];
};

export type ZitiEdgeRouter = {
  id: string;
  name: string;
  roleAttributes: string[];
};

export type ZitiServicePolicy = {
  id: string;
  name: string;
  type: 'Bind' | 'Dial';
  semantic: 'AllOf' | 'AnyOf';
  identityRoles: string[];
  serviceRoles: string[];
};

export type ZitiEdgeRouterPolicy = {
  id: string;
  name: string;
  semantic: 'AllOf' | 'AnyOf';
  edgeRouterRoles: string[];
  serviceRoles: string[];
};

export type ZitiIdentityRouterPolicy = {
  id: string;
  name: string;
  semantic: 'AllOf' | 'AnyOf';
  identityRoles: string[];
  edgeRouterRoles: string[];
};

export type ZitiEnrollment = {
  id: string;
  identityId: string;
  method: string;
  expiresAt: string;
  jwt?: string;
};
