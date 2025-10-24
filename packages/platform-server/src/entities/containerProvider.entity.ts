// Back-compat shim mapping old ContainerProviderEntity to new WorkspaceNode
export {
  WorkspaceNode as ContainerProviderEntity,
  ContainerProviderStaticConfigSchema,
  type ContainerProviderStaticConfig,
} from '../nodes/workspace/workspace.node';

