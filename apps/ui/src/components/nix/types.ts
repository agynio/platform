// Single selected Nix package stored by name and optional version
export interface NixPackageSelection {
  name: string;
  version?: string | null;
  attribute_path?: string;
  commit_hash?: string;
}

// Container (Workspace) Nix configuration shape stored under config.nix
export interface ContainerNixConfig {
  packages?: NixPackageSelection[];
}
