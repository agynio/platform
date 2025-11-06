export interface NixPackageDTO { name: string; description?: string | null }
export interface PackagesResponse { packages: NixPackageDTO[] }
export interface VersionsResponse { versions: string[] }
export interface ResolveResponse { name: string; version: string; commitHash: string; attributePath: string }

