import type { Db, Collection, WithId, UpdateFilter, Filter } from 'mongodb';
import { LoggerService } from './logger.service';

export type ContainerStatus = 'running' | 'stopped' | 'terminating' | 'failed';

export interface ContainerDoc {
  container_id: string;
  node_id: string;
  thread_id: string;
  provider_type: 'docker';
  image: string;
  status: ContainerStatus;
  created_at: string; // ISO string
  updated_at: string; // ISO string
  last_used_at: string; // ISO string
  kill_after_at: string | null; // ISO string or null
  termination_reason: string | null;
  deleted_at: string | null;
  metadata?: Record<string, any>;
}

export class ContainerRegistryService {
  private col: Collection<ContainerDoc>;

  constructor(db: Db, private logger: LoggerService) {
    this.col = db.collection<ContainerDoc>('containers');
  }

  async ensureIndexes(): Promise<void> {
    await this.col.createIndex({ container_id: 1 }, { unique: true, name: 'uniq_container_id' });
    await this.col.createIndex({ status: 1, kill_after_at: 1 }, { name: 'status_kill_after' });
    await this.col.createIndex({ node_id: 1, status: 1, last_used_at: 1 }, { name: 'node_status_last_used' });
  }

  private computeKillAfter(lastUsedIso: string, ttlSeconds?: number): string | null {
    const ttl = typeof ttlSeconds === 'number' ? ttlSeconds : 86400; // default 24h
    if (ttl <= 0) return null;
    const t = new Date(lastUsedIso).getTime() + ttl * 1000;
    return new Date(t).toISOString();
  }

  async registerStart(args: {
    containerId: string;
    nodeId: string;
    threadId: string;
    image: string;
    providerType?: 'docker';
    labels?: Record<string, string>;
    platform?: string;
    ttlSeconds?: number;
  }): Promise<void> {
    const now = new Date().toISOString();
    const killAfter = this.computeKillAfter(now, args.ttlSeconds);
    const metadata: Record<string, any> = {
      labels: args.labels || {},
      platform: args.platform,
      ttlSeconds: typeof args.ttlSeconds === 'number' ? args.ttlSeconds : 86400,
    };
    const update: UpdateFilter<ContainerDoc> = {
      $setOnInsert: { created_at: now },
      $set: {
        container_id: args.containerId,
        node_id: args.nodeId,
        thread_id: args.threadId,
        provider_type: args.providerType || 'docker',
        image: args.image,
        status: 'running',
        updated_at: now,
        last_used_at: now,
        kill_after_at: killAfter,
        termination_reason: null,
        deleted_at: null,
        metadata,
      },
    };
    await this.col.updateOne({ container_id: args.containerId }, update, { upsert: true });
  }

  async updateLastUsed(containerId: string, now: Date = new Date(), ttlOverrideSeconds?: number): Promise<void> {
    const doc = await this.col.findOne({ container_id: containerId });
    const ttl = typeof ttlOverrideSeconds === 'number' ? ttlOverrideSeconds : (doc?.metadata?.ttlSeconds ?? 86400);
    const nowIso = now.toISOString();
    const kill = this.computeKillAfter(nowIso, ttl);
    const update: UpdateFilter<ContainerDoc> = {
      $set: { last_used_at: nowIso, updated_at: nowIso, kill_after_at: kill },
    };
    if (!doc) {
      // Unknown container; upsert minimal record to avoid missing updates
      const fullUpdate: UpdateFilter<ContainerDoc> = {
        $setOnInsert: {
          node_id: 'unknown',
          thread_id: 'unknown',
          provider_type: 'docker',
          image: 'unknown',
          status: 'running',
          created_at: nowIso,
          termination_reason: null,
          deleted_at: null,
          metadata: { ttlSeconds: ttl },
        },
        ...update,
      };
      await this.col.updateOne({ container_id: containerId }, fullUpdate, { upsert: true });
    } else {
      await this.col.updateOne({ container_id: containerId }, update);
    }
  }

  async markTerminating(containerId: string, reason: string, claimId?: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const update: UpdateFilter<ContainerDoc> = {
      $set: {
        status: 'terminating',
        updated_at: nowIso,
        termination_reason: reason,
        ...(claimId ? { 'metadata.claimId': claimId } : {}),
      },
    };
    await this.col.updateOne({ container_id: containerId }, update);
  }

  async markStopped(containerId: string, reason: string): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.col.updateOne(
      { container_id: containerId },
      { $set: { status: 'stopped', updated_at: nowIso, deleted_at: nowIso, termination_reason: reason } },
    );
  }

  async claimForTermination(containerId: string, claimId: string): Promise<boolean> {
    const nowIso = new Date().toISOString();
    const res = await this.col.updateOne(
      { container_id: containerId, status: 'running' },
      { $set: { status: 'terminating', updated_at: nowIso, 'metadata.claimId': claimId } },
    );
    return res.modifiedCount === 1;
  }

  async getExpired(now: Date = new Date()) {
    const iso = now.toISOString();
    // Include running past kill_after_at, and terminating past retryAfter (or missing)
    const filter: Filter<ContainerDoc> = {
      $or: [
        { status: 'running', kill_after_at: { $ne: null, $lte: iso } },
        {
          status: 'terminating',
          $or: [
            { 'metadata.retryAfter': { $exists: false } },
            { 'metadata.retryAfter': { $lte: iso } },
          ],
        },
      ],
    } as unknown as Filter<ContainerDoc>;
    return await this.col.find(filter).toArray();
  }

  /** Record a termination failure and schedule a retry with backoff. */
  async recordTerminationFailure(containerId: string, message: string): Promise<void> {
    const now = Date.now();
    // Read current attempts to compute backoff
    const doc = await this.col.findOne({ container_id: containerId });
    const attempts = (doc?.metadata?.terminationAttempts as number | undefined) ?? 0;
    const nextAttempts = attempts + 1;
    // Exponential backoff in seconds: min(2^attempts, 900s)
    const delayMs = Math.min(Math.pow(2, attempts) * 1000, 15 * 60 * 1000);
    const retryAfterIso = new Date(now + delayMs).toISOString();
    const update: UpdateFilter<ContainerDoc> = {
      $set: {
        updated_at: new Date().toISOString(),
        'metadata.lastError': message,
        'metadata.retryAfter': retryAfterIso,
        'metadata.terminationAttempts': nextAttempts,
      },
    };
    await this.col.updateOne({ container_id: containerId }, update);
  }

  // Minimal adapter used for backfill. ContainerService satisfies this structurally.
  // Keeping it local enables strongly-typed fakes in tests without any casts.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
  static BackfillAdapter = class {
    // This class is used only for its shape; do not instantiate at runtime.
    // Use protected constructor to avoid 'private ctor' generic constraint issues in tests.
    protected constructor() {}
    findContainersByLabels!: (
      labels: Record<string, string>,
      options?: { all?: boolean },
    ) => Promise<Array<{ id: string }>>;
    getContainerLabels!: (id: string) => Promise<Record<string, string> | undefined>;
    getDocker!: () => {
      getContainer: (
        id: string,
      ) => { inspect: () => Promise<{ Created?: string; State?: { Running?: boolean } | undefined; Config?: { Image?: string } | undefined }> };
    };
  };

  async backfillFromDocker(containerService: {
    findContainersByLabels: (
      labels: Record<string, string>,
      options?: { all?: boolean },
    ) => Promise<Array<{ id: string }>>;
    getContainerLabels: (id: string) => Promise<Record<string, string> | undefined>;
    getDocker: () => {
      getContainer: (
        id: string,
      ) => { inspect: () => Promise<{ Created?: string; State?: { Running?: boolean }; Config?: { Image?: string } }> };
    };
  }): Promise<void> {
    this.logger.info('ContainerRegistry: backfilling from Docker');
    try {
      const list = await containerService.findContainersByLabels({ 'hautech.ai/role': 'workspace' }, { all: true });
      const nowIso = new Date().toISOString();
      // Concurrency-controlled backfill to avoid long sequential runs
      const concurrency = 5;
      let index = 0;
      const runNext = async (): Promise<void> => {
        const i = index++;
        const item = list[i];
        if (!item) return;
        try {
          const labels = await containerService.getContainerLabels(item.id);
          if (labels && labels['hautech.ai/role'] !== 'workspace') {
            return; // skip non-workspace containers defensively
          }
          const thread = labels?.['hautech.ai/thread_id'] || '';
          const [nodeId, threadId] = thread.includes('__') ? thread.split('__', 2) : ['unknown', thread];
          const inspect = await containerService.getDocker().getContainer(item.id).inspect();
          const created = inspect?.Created ? new Date(inspect.Created).toISOString() : nowIso;
          const running = !!inspect?.State?.Running;
          // Determine whether this is a new or existing record
          const existing = await this.col.findOne({ container_id: item.id });
          if (existing) {
            // Existing record: do not bump last_used_at; optionally recompute kill_after_at if missing.
            // Preserve unrelated metadata fields (e.g., lastError, retryAfter, terminationAttempts) by updating dotted paths only.
            const setFields: Partial<ContainerDoc> & Record<string, unknown> = {
              container_id: item.id,
              node_id: nodeId,
              thread_id: threadId,
              provider_type: 'docker',
              image: inspect?.Config?.Image || 'unknown',
              status: running ? 'running' : 'stopped',
              updated_at: nowIso,
              termination_reason: null,
              deleted_at: running ? null : nowIso,
              // Preserve existing metadata; update selective paths only
              'metadata.labels': labels,
              'metadata.platform': labels?.['hautech.ai/platform'],
            };
            if (!existing.kill_after_at && existing.last_used_at && typeof existing.metadata?.ttlSeconds === 'number') {
              const ttl = existing.metadata?.ttlSeconds;
              const recomputed = this.computeKillAfter(existing.last_used_at, ttl);
              setFields.kill_after_at = recomputed;
              // Rationale: Parity with legacy data. During backfill, if kill_after_at is missing
              // but last_used_at and ttlSeconds are present, recompute to restore expected value.
              // Do not gate on running to avoid missing stopped-but-not-cleaned historical records.
              this.logger.debug(
                `ContainerRegistry: backfill recomputed kill_after_at for existing cid=${item.id.substring(0, 12)} ttl=${ttl}`,
              );
            } else {
              this.logger.debug(
                `ContainerRegistry: backfill existing cid=${item.id.substring(0, 12)} - skipping last_used_at update`,
              );
            }
            // Preserve existing ttlSeconds; only set default when absent.
            if (typeof existing.metadata?.ttlSeconds !== 'number') setFields['metadata.ttlSeconds'] = 86400;
            const updateExisting: UpdateFilter<ContainerDoc> = { $set: setFields };
            await this.col.updateOne({ container_id: item.id }, updateExisting, { upsert: false });
          } else {
            // New record: set last_used_at on insert and compute kill_after_at
            const updateNew: UpdateFilter<ContainerDoc> = {
              $setOnInsert: { created_at: created },
              $set: {
                container_id: item.id,
                node_id: nodeId,
                thread_id: threadId,
                provider_type: 'docker',
                image: inspect?.Config?.Image || 'unknown',
                status: running ? 'running' : 'stopped',
                updated_at: nowIso,
                last_used_at: running ? nowIso : created,
                kill_after_at: running ? this.computeKillAfter(nowIso, 86400) : null,
                termination_reason: null,
                deleted_at: running ? null : nowIso,
                // Use targeted metadata updates to avoid clobbering potential future fields.
                'metadata.labels': labels,
                'metadata.platform': labels?.['hautech.ai/platform'],
                'metadata.ttlSeconds': 86400,
              },
            };
            await this.col.updateOne({ container_id: item.id }, updateNew, { upsert: true });
          }
        } catch (e) {
          this.logger.error('ContainerRegistry: backfill error for container', item.id, e);
        }
        await runNext();
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, () => runNext()));
    } catch (e) {
      this.logger.error('ContainerRegistry: backfill listing error', e);
    }
  }
}
