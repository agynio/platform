import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { ConfigService } from "./config.service";
import { AgentService } from "./agent.service";

const __dirname = dirname(fileURLToPath(import.meta.url));

const configService = new ConfigService();
const agentService = new AgentService(configService);

const agent = agentService.createAgent();

const Instructions = fs.readFileSync(`${__dirname}/instructions.md`, 'utf-8');

const response = await agent.invoke({
    messages: [
        { role: "system", content: Instructions },
        {
            role: "user",
            content: "Analyze code of all cloned repos and create documentation. Iterate until all repos are fully documented.",
        },
    ],
});


// Placeholder for agent logic using Graph/StateGraph if needed
console.log("Bash agent tools initialized.");
