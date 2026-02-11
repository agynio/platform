export type LiteLLMProviderField = {
  key: string;
  label: string;
  placeholder?: string | null;
  tooltip?: string | null;
  required: boolean;
  field_type: string;
  options?: string[] | null;
  default_value?: string | null;
};

export type LiteLLMProviderInfo = {
  provider: string;
  provider_display_name: string;
  litellm_provider: string;
  credential_fields: LiteLLMProviderField[];
  default_model_placeholder?: string | null;
};

export type LiteLLMCredentialSummary = {
  credential_name: string;
  credential_info: Record<string, unknown>;
  credential_values: Record<string, unknown>;
};

export type LiteLLMCredentialDetail = LiteLLMCredentialSummary;

export type LiteLLMModelRecord = {
  model_name: string;
  litellm_params: Record<string, unknown>;
  model_info: Record<string, unknown>;
  model_id?: string;
};

export type LiteLLMHealthResponse = {
  success?: boolean;
  status?: string;
  [key: string]: unknown;
};

export type LiteLLMGenericResponse = {
  success?: boolean;
  message?: string;
  [key: string]: unknown;
};

export type LiteLLMAdminStatus = {
  configured: boolean;
  baseUrl?: string;
  hasMasterKey: boolean;
  provider: string;
  adminReachable?: boolean;
  reason?: 'missing_env' | 'unauthorized' | 'unreachable';
};
