import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { Annotation, CompiledStateGraph, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { last } from "lodash-es";
import { ContainerProviderEntity } from "../entities/containerProvider.entity";
import { CallModelNode } from "../nodes/callModel.node";
import { ToolsNode } from "../nodes/tools.node";
import { ConfigService } from "../services/config.service";
import { LoggerService } from "../services/logger.service";
import { BashCommandTool } from "../tools/bash_command";
import { GithubCloneRepoTool } from "../tools/github_clone_repo";
import { BaseAgent } from "./base.agent";
import { SendSlackMessageTool } from "../tools/send_slack_message.tool";
import { SlackService } from "../services/slack.service";
import * as Prompts from "../prompts";
import { RunnableConfig } from "@langchain/core/runnables";
import { CheckpointerService } from "../services/checkpointer.service";

export class ArchitectAgent extends BaseAgent {
  constructor(
    private configService: ConfigService,
    private loggerService: LoggerService,
    private slackService: SlackService,
    private containerProvider: ContainerProviderEntity,
    private checkpointerService: CheckpointerService,
  ) {
    super(loggerService);
    this.init();
  }

  protected state() {
    return Annotation.Root({
      messages: Annotation<BaseMessage[]>({
        default: () => [],
        reducer: (current: BaseMessage[], update: BaseMessage[]) => [...current, ...update],
      }),
    });
  }

  init(config: RunnableConfig = { recursionLimit: 250 }) {
    this._config = config;

    const llm = new ChatOpenAI({
      model: "gpt-5",
      apiKey: this.configService.openaiApiKey,
    });

    const tools = [
      new BashCommandTool(this.loggerService, this.containerProvider),
      new GithubCloneRepoTool(this.configService, this.loggerService, this.containerProvider),
      new SendSlackMessageTool(this.slackService, this.loggerService),
    ];
    const callModelNode = new CallModelNode(tools, llm).init({ systemPrompt: Prompts.Architect });
    const toolsNode = new ToolsNode(tools);

    const builder = new StateGraph(
      {
        stateSchema: this.state(),
      },
      this.configuration(),
    )
      .addNode("call_model", callModelNode.action.bind(callModelNode))
      .addNode("tools", toolsNode.action.bind(toolsNode))
      .addEdge(START, "call_model")
      .addConditionalEdges(
        "call_model",
        (state) => (last(state.messages as AIMessage[])?.tool_calls?.length ? "tools" : END),
        {
          tools: "tools",
          [END]: END,
        },
      )
      .addEdge("tools", "call_model");
    this._graph = builder.compile({ checkpointer: this.checkpointerService.getCheckpointer() }) as CompiledStateGraph<
      unknown,
      unknown
    >;

    return this;
  }
}
