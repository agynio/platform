import {
  WorkspaceRuntimeProvider,
  type DestroyWorkspaceOptions as RuntimeDestroyWorkspaceOptions,
  type WorkspaceExecRequest,
  type WorkspaceExecResult,
  type WorkspaceKey,
  type WorkspaceLogsRequest,
  type WorkspaceLogsSession,
  type WorkspaceRuntimeCapabilities,
  type WorkspaceRuntimeProviderType,
  type WorkspaceSpec,
  type WorkspaceStatus,
  type WorkspaceStdioSession,
  type WorkspaceStdioSessionRequest,
  type WorkspaceTerminalSession,
  type WorkspaceTerminalSessionRequest,
} from '../runtime/workspace.runtime.provider';

export type WorkspaceProviderCapabilities = WorkspaceRuntimeCapabilities;
export type ExecRequest = WorkspaceExecRequest;
export type ExecResult = WorkspaceExecResult;
export type InteractiveExecRequest = WorkspaceStdioSessionRequest & { tty?: boolean };
export type InteractiveExecSession = WorkspaceStdioSession & { execId: string };
export type DestroyWorkspaceOptions = RuntimeDestroyWorkspaceOptions;

export type WorkspaceLogsRequestCompat = WorkspaceLogsRequest;
export type WorkspaceLogsSessionCompat = WorkspaceLogsSession;
export type WorkspaceTerminalSessionCompat = WorkspaceTerminalSession;
export type WorkspaceTerminalSessionRequestCompat = WorkspaceTerminalSessionRequest;

export abstract class WorkspaceProvider extends WorkspaceRuntimeProvider {}

export {
  WorkspaceKey,
  WorkspaceSpec,
  WorkspaceStatus,
  WorkspaceRuntimeProviderType as WorkspaceProviderType,
};
