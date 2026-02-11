import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { LLMSettingsService } from '../src/settings/llm/llmSettings.service';
import { ConfigService, configSchema } from '../src/core/services/config.service';

const LITELLM_BASE = 'http://127.0.0.1:4000';
const MASTER_KEY = 'sk-dev-master-1234';

const createConfig = () =>
  new ConfigService().init(
    configSchema.parse({
      litellmBaseUrl: LITELLM_BASE,
      litellmMasterKey: MASTER_KEY,
      agentsDatabaseUrl: 'postgres://dev:dev@localhost:5432/agents',
    }),
  );

function createLiteLLMStubServer(masterKey: string, port = 4000) {
  const fastify = Fastify({ logger: false });

  type CredentialRecord = {
    credential_info: Record<string, unknown>;
    credential_values: Record<string, unknown>;
  };

  type ModelRecord = {
    model_name: string;
    litellm_params: Record<string, unknown>;
    model_info: Record<string, unknown>;
  };

  const credentials = new Map<string, CredentialRecord>();
  const models = new Map<string, ModelRecord>();

  const providers = [
    {
      provider: 'openai',
      provider_display_name: 'OpenAI',
      litellm_provider: 'openai',
      credential_fields: [
        {
          key: 'api_key',
          label: 'API Key',
          field_type: 'password',
          required: true,
        },
      ],
      default_model_placeholder: 'gpt-4o-mini',
    },
  ];

  fastify.addHook('onRequest', (request, reply, done) => {
    const auth = request.headers.authorization;
    if (auth !== `Bearer ${masterKey}`) {
      reply.code(401).send({ error: 'unauthorized' });
      return;
    }
    done();
  });

  fastify.get('/health', async () => ({ status: 'ok' }));

  fastify.get('/public/providers/fields', async () => providers);

  fastify.get('/credentials', async () => ({
    credentials: Array.from(credentials.entries()).map(([credential_name, record]) => ({
      credential_name,
      credential_info: record.credential_info,
      credential_values: record.credential_values,
    })),
  }));

  fastify.get<{
    Params: { name: string };
  }>('/credentials/by_name/:name', async (request, reply) => {
    const record = credentials.get(request.params.name);
    if (!record) {
      reply.code(404).send({ error: 'credential_not_found' });
      return;
    }
    reply.send({
      credential_name: request.params.name,
      credential_info: record.credential_info,
      credential_values: record.credential_values,
    });
  });

  fastify.post<{
    Body: {
      credential_name?: string;
      credential_info?: Record<string, unknown>;
      credential_values?: Record<string, unknown>;
    };
  }>('/credentials', async (request, reply) => {
    const { credential_name, credential_info, credential_values } = request.body || {};
    if (!credential_name || !credential_info) {
      reply.code(400).send({ error: 'invalid_payload' });
      return;
    }
    credentials.set(credential_name, {
      credential_info: { ...credential_info },
      credential_values: { ...(credential_values || {}) },
    });
    reply.send({ success: true, credential_name });
  });

  fastify.patch<{
    Params: { name: string };
    Body: {
      credential_info?: Record<string, unknown>;
      credential_values?: Record<string, unknown>;
    };
  }>('/credentials/:name', async (request, reply) => {
    const record = credentials.get(request.params.name);
    if (!record) {
      reply.code(404).send({ error: 'credential_not_found' });
      return;
    }
    const info = request.body?.credential_info || {};
    const values = request.body?.credential_values || {};
    credentials.set(request.params.name, {
      credential_info: { ...record.credential_info, ...info },
      credential_values: { ...record.credential_values, ...values },
    });
    reply.send({ success: true });
  });

  fastify.delete<{
    Params: { name: string };
  }>('/credentials/:name', async (request, reply) => {
    credentials.delete(request.params.name);
    reply.send({ success: true });
  });

  fastify.get('/model/info', async () => ({ data: Array.from(models.values()) }));

  fastify.post<{
    Body: ModelRecord;
  }>('/model/new', async (request, reply) => {
    const { model_name, litellm_params, model_info } = request.body || {};
    if (!model_name || !litellm_params || !model_info) {
      reply.code(400).send({ error: 'invalid_payload' });
      return;
    }
    const record = {
      model_name,
      litellm_params: { ...litellm_params },
      model_info: { ...model_info },
    } satisfies ModelRecord;
    models.set(model_name, record);
    reply.send(record);
  });

  fastify.post<{
    Body: ModelRecord;
  }>('/model/update', async (request, reply) => {
    const { model_name, litellm_params, model_info } = request.body || {};
    if (!model_name) {
      reply.code(400).send({ error: 'invalid_payload' });
      return;
    }
    const existing = models.get(model_name);
    const record = {
      model_name,
      litellm_params: { ...(existing?.litellm_params ?? {}), ...(litellm_params || {}) },
      model_info: { ...(existing?.model_info ?? {}), ...(model_info || {}) },
    } satisfies ModelRecord;
    models.set(model_name, record);
    reply.send(record);
  });

  fastify.post<{
    Body: { id?: string };
  }>('/model/delete', async (request, reply) => {
    const id = request.body?.id;
    if (id) models.delete(id);
    reply.send({ success: true });
  });

  fastify.post<{
    Body: {
      litellm_params?: Record<string, unknown>;
      model_info?: Record<string, unknown>;
    };
  }>('/health/test_connection', async (request, reply) => {
    const params = request.body?.litellm_params;
    const credentialName = typeof params?.litellm_credential_name === 'string' ? params.litellm_credential_name : undefined;
    if (!credentialName || !credentials.has(credentialName)) {
      reply.code(400).send({ error: 'credential_not_found' });
      return;
    }
    reply.send({ success: true, status: 'ok' });
  });

  fastify.post<{
    Body: {
      model?: string;
      messages?: Array<Record<string, unknown>>;
    };
  }>('/v1/chat/completions', async (request, reply) => {
    const modelId = request.body?.model;
    if (!modelId) {
      reply.code(400).send({ error: 'model_required' });
      return;
    }
    const record = models.get(modelId);
    const mockResponse = record?.litellm_params?.mock_response as
      | { choices?: Array<{ message?: { content?: string } }>; }
      | undefined;
    if (mockResponse?.choices?.[0]?.message?.content) {
      reply.send(mockResponse);
      return;
    }
    reply.send({
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'integration-ok',
          },
        },
      ],
    });
  });

  const start = async () => {
    await fastify.listen({ port, host: '127.0.0.1' });
  };

  const stop = async () => {
    await fastify.close();
  };

  const reset = () => {
    credentials.clear();
    models.clear();
  };

  return { start, stop, reset, server: fastify } satisfies {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    reset: () => void;
    server: FastifyInstance;
  };
}

describe.sequential('LiteLLM admin integration', () => {
  const stub = createLiteLLMStubServer(MASTER_KEY, 4000);

  beforeAll(async () => {
    await stub.start();
  }, 120_000);

  afterAll(async () => {
    await stub.stop();
  });

  beforeEach(() => {
    stub.reset();
  });

  it('reports admin status as reachable when LiteLLM responds', async () => {
    const service = new LLMSettingsService(createConfig());
    const status = await service.getAdminStatus();
    expect(status).toMatchObject({
      configured: true,
      adminReachable: true,
      baseUrl: LITELLM_BASE,
    });
  });

  it('manages credentials and models end-to-end', async () => {
    const service = new LLMSettingsService(createConfig());
    const credentialName = `integration-cred-${Date.now()}`;
    const modelName = `integration-model-${Date.now()}`;

    await service.createCredential({
      name: credentialName,
      provider: 'openai',
      values: { api_key: 'sk-fake-key' },
    });

    await service.createModel({
      name: modelName,
      provider: 'openai',
      model: 'gpt-4o',
      credentialName,
      mode: 'chat',
      params: {
        mock_response: {
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: { role: 'assistant', content: 'integration-ok' },
            },
          ],
          usage: { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 },
        },
      },
    });

    const health = await service.testModel({ id: modelName });
    expect(health).toBeTruthy();

    const runtimeRes = await fetch(`${LITELLM_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MASTER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    expect(runtimeRes.ok).toBe(true);
    const runtimeBody = (await runtimeRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
    expect(runtimeBody?.choices?.[0]?.message?.content).toBe('integration-ok');

    await service.deleteModel(modelName);
    await service.deleteCredential(credentialName);
  }, 60_000);
});
