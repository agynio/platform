## Graph Runtime Ports

The live graph runtime requires a declarative ports registry. All edges are reversible via `create`/`destroy` method pairs.

Example definition:
```
NodeTemplateA: {
  sourcePorts: {
    outputItems: { kind: 'method', create: 'emitItem', destroy: 'unemitItem' },
    self: { kind: 'instance' }
  },
  targetPorts: {
    self: { kind: 'instance' },
    items: { kind: 'method', create: 'addItem', destroy: 'removeItem' }
  }
}
```

Rules:
- Exactly one side of an edge must reference a `method` port; the other side must be an `instance` port.
- Every method port must declare both `create` and `destroy` (universal reversibility).
- Reversal invokes `destroy` with the same argument (opposite node instance).
- All graph participants (agents, triggers, tools) implement a `destroy()` lifecycle hook.
# Bash Agent

A TypeScript agent using `@langchain/langgraph` to interact with bash and files.

## Features


# Agents Workspace

## Realtime Checkpoint Writes Stream (WIP)

The server now exposes a Socket.IO endpoint (default `http://localhost:3010`) that streams `checkpoint_writes` from MongoDB.

Client must emit an `init` event before any data is sent:

```ts
socket.emit('init'); // currently no filters required – streams all new writes
```

Server -> Client events:
- `initial`: `{ items: CheckpointWrite[] }` last 50 docs (chronological)
- `append`: `CheckpointWrite` new inserts
- `error`: `{ message: string }`

   checkpointId: string;
   threadId: string;
   taskId: string;
   channel: string;
   type: string;
   idx: number;
   value: any;       // decoded from Binary if possible
   createdAt: Date;  // derived from ObjectId timestamp
}
```

### MongoDB Replica Set Requirement
MongoDB change streams require the database to run as a replica set (even a single-node replica set). The included `docker-compose.yml` configures Mongo with `--replSet rs0` and an init script that runs `rs.initiate(...)` the first time the data directory is empty.

If you previously started Mongo without a replica set, you must remove the old volume so the init script can run:
```bash
docker compose down -v
# then start fresh
docker compose up -d mongo
```
After first startup, you can verify:
```bash
docker compose exec mongo mongosh --eval 'rs.status().ok'
```
Should output `1`.

Connection string examples (env `MONGODB_URL`):
- Without auth: `mongodb://localhost:27017/?replicaSet=rs0`
- With root auth (if you add it): `mongodb://root:root@localhost:27017/?authSource=admin&replicaSet=rs0`

If the driver was connected prior to initiation you may need to restart the server process.

### Environment

Add to your `.env` (values required by existing config schema plus Mongo):
```
GITHUB_APP_ID=...
GITHUB_APP_PRIVATE_KEY=...
GITHUB_INSTALLATION_ID=...
OPENAI_API_KEY=...
GH_TOKEN=...
SLACK_BOT_TOKEN=...
SLACK_APP_TOKEN=...
MONGODB_URL=mongodb://localhost:27017/?replicaSet=rs0
```

### Run Server
```bash
pnpm --filter bash-agent start
```

### Run UI
```bash
pnpm --filter ui dev
```

Then open the UI; it will automatically issue `init` and begin streaming.

---
More documentation pending (tests & advanced filtering).
   ```
2. Set your OpenAI API key in `.env`:
   ```env
   OPENAI_API_KEY=your-key-here
   ```
3. (Optional) Configure GitHub credentials for PR/file operations:

   ```env
   # Personal access token (classic or fine-grained) used for commenting, user-scoped actions
   GH_TOKEN=ghp_yourtoken             # or use GITHUB_TOKEN

   # GitHub App credentials (needed if using app-based auth flows)
   GITHUB_APP_ID=123456
   # Store the PEM with literal newlines or escaped \n sequences
   GITHUB_APP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...lines...\n-----END PRIVATE KEY-----\n"
   GITHUB_INSTALLATION_ID=987654321
   ```

   Notes:
   - `GITHUB_APP_PRIVATE_KEY` may be supplied either with actual newlines or with `\n` escape sequences; the config service normalizes it.
   - If you only need simple authenticated REST calls or PR comments, a personal token (`GH_TOKEN` / `GITHUB_TOKEN`) is sufficient.
   - For organization-wide or installation-scoped access, provide the App credentials.

4. Run the agent:

   ```bash
   pnpm start
   ```

5. (Optional) Enable Slack trigger (Socket Mode) and messaging:

   ```env
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_APP_TOKEN=xapp-your-app-level-token
   ```

   Then you can instantiate and start the trigger and use the send_slack_message tool:

   ```ts
    import { SlackTrigger } from "./src/triggers";
    import { ConfigService } from "./src/services/config.service";
    import { LoggerService } from "./src/services/logger.service";
    import { SlackService } from "./src/services/slack.service";
    import { SendSlackMessageTool } from "./src/tools/send_slack_message.tool";

    const config = ConfigService.fromEnv();
    const logger = new LoggerService();
    const slackService = new SlackService(config, logger);
    const trigger = new SlackTrigger(slackService, logger);
    await trigger.start();
    await trigger.subscribe(async (thread, messages) => {
       console.log("Slack thread:", thread, messages);
    });

    const sendTool = new SendSlackMessageTool(slackService, logger).init();
    await sendTool.invoke({ channel: "C12345678", text: "Hello from the agent" });
   ```

   Any user messages (non-bot) the bot can see will be forwarded to subscribers. Use the tool to send replies or new messages.

6. (Optional) Start local MongoDB using Docker Compose:

   A `docker-compose.yml` is included to run MongoDB locally.

   ```bash
   docker compose up -d mongo
   # or (older docker): docker-compose up -d mongo
   ```

   This launches a MongoDB 7 container with a single-node replica set `rs0` listening on `localhost:27017`.

   Copy `.env.example` to `.env` and ensure the connection string is present:

   ```bash
   cp .env.example .env
   ```

   Default connection string:

   ```env
   MONGODB_URL=mongodb://localhost:27017/?replicaSet=rs0
   ```

   View logs:
   ```bash
   docker compose logs -f mongo
   ```

   Stop and remove container (data persists in named volume `agents_mongo_data`):
   ```bash
   docker compose down
   ```

   Remove volume as well (this deletes data):
   ```bash
   docker compose down -v
   ```

## Tools

- `bash_command(command: string)`
- `read_file(path: string)`
- `write_file(path: string, content: string)`
- `edit_file(path: string, old_content: string, new_content: string)`

## Stack

- TypeScript
- pnpm
- @langchain/langgraph

## Triggers

### SlackTrigger
Streams inbound Slack messages with optional `debounceMs` and `waitForBusy` behavior.

### PRTrigger (GitHub Pull Request Polling)

Polls GitHub for open pull requests in specified repositories where the authenticated user is assigned (optionally also authored) and emits messages when a PR's state changes.

Change detection criteria:
- New timeline event (comment, review, review comment, commit, etc.)
- Check run status or conclusion change
- Mergeability (`mergeable`, `mergeableState`) transition

Each PR produces messages on a per-PR thread key: `repo#number`.

Example:
```ts
import { PRTrigger } from './src/triggers';
import { GithubService } from './src/services/github.service';
import { PRService } from './src/services/pr.service';
import { LoggerService } from './src/services/logger.service';
import { ConfigService } from './src/services/config.service';

const config = ConfigService.fromEnv();
const logger = new LoggerService();
const github = new GithubService(config);
const prService = new PRService(github);

const trigger = new PRTrigger(github, prService, logger, {
   owner: 'my-org',
   repos: ['frontend', 'backend'],
   intervalMs: 60_000,
   includeAuthored: false,
   debounceMs: 300,
   waitForBusy: true,
});

await trigger.subscribe(async (thread, messages) => {
   messages.forEach(m => {
      console.log('PR update', thread, m.content, m.info);
   });
});

await trigger.start();
```
