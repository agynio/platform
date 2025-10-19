// Selected Nix package stored with fully-resolved metadata (issue #305)
export interface NixPackageSelection {
  name: string;
  version: string;
  commitHash: string;
  attributePath: string;
}

// Container (Workspace) Nix configuration shape stored under config.nix
export interface ContainerNixConfig {
  packages?: NixPackageSelection[];
}
