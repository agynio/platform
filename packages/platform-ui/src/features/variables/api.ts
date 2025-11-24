import { http, asData } from '@/api/http';

export interface VariableItem {
  key: string;
  graph: string | null;
  local: string | null;
}

export interface ListVariablesResponse {
  items: VariableItem[];
}

export interface CreateVariablePayload {
  key: string;
  graph: string;
}

export interface UpdateVariablePayload {
  graph?: string | null;
  local?: string | null;
}

const VARIABLES_ENDPOINT = '/api/graph/variables';

export async function listVariables(): Promise<VariableItem[]> {
  const res = await asData<ListVariablesResponse>(http.get<ListVariablesResponse>(VARIABLES_ENDPOINT));
  return res.items ?? [];
}

export async function createVariable(payload: CreateVariablePayload): Promise<{ key: string; graph: string }>
{
  return asData<{ key: string; graph: string }>(http.post(VARIABLES_ENDPOINT, payload));
}

export async function updateVariable(key: string, payload: UpdateVariablePayload): Promise<UpdateVariablePayload & { key: string }>
{
  return asData<UpdateVariablePayload & { key: string }>(http.put(`${VARIABLES_ENDPOINT}/${encodeURIComponent(key)}`, payload));
}

export async function deleteVariable(key: string): Promise<void> {
  await asData<void>(http.delete(`${VARIABLES_ENDPOINT}/${encodeURIComponent(key)}`));
}

