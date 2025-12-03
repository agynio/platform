export interface NixPackageDTO { name: string; description?: string | null }
export interface PackagesResponse { packages: NixPackageDTO[] }
export interface VersionsResponse { versions: string[] }
export interface ResolvePackageResponse {
  name: string;
  version: string;
  commitHash: string;
  attributePath: string;
}

export interface ResolveRepoResponse {
  repository: string;
  ref: string;
  commitHash: string;
  attributePath: string;
  flakeUri: string;
  attrCheck: 'skipped' | 'ok';
}
