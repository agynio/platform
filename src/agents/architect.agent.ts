import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { last } from "lodash-es";
import { CallModelNode } from "../nodes/callModel.node";
import { ToolsNode } from "../nodes/tools.node";
import { ConfigService } from "../services/config.service";
import { LoggerService } from "../services/logger.service";
import { BashCommandTool } from "../tools/bash_command";
import { BaseAgent } from "./base.agent";
import { ContainerEntity } from "../services/container.service";
import { GithubCloneRepoTool } from "../tools/github_clone_repo";

export class ArchitectAgent extends BaseAgent {
  constructor(
    private configService: ConfigService,
    private loggerService: LoggerService,
  ) {
    super();
  }

  protected state() {
    return Annotation.Root({
      messages: Annotation<BaseMessage[]>,
    });
  }

  create(container: ContainerEntity) {
    const llm = new ChatOpenAI({
      model: "gpt-5",
      apiKey: this.configService.openaiApiKey,
    });

    const tools = [
      new BashCommandTool(this.loggerService, container),
      new GithubCloneRepoTool(this.configService, this.loggerService, container),
    ];
    const callModelNode = new CallModelNode(tools, llm);
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

    const graph = builder.compile();

    return graph;
  }
}
