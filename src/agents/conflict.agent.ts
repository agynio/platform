import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { last } from "lodash-es";
import { ConfigService } from "../services/config.service";
import { LoggerService } from "../services/logger.service";
import { CodespaceSSHService } from "../services/codespace-ssh.service";
import { BaseAgent } from "./base.agent";
import { CallModelNode } from "../nodes/callModel.node";
import { ToolsNode } from "../nodes/tools.node";
import { RemoteBashCommandTool } from "../tools/remote_bash_command";

export class ConflictAgent extends BaseAgent {
  constructor(
    private configService: ConfigService,
    private loggerService: LoggerService,
    private codespaceName = "fantastic-robot-7749rxj6j63w656",
  ) {
    super();
  }

  protected state() {
    return Annotation.Root({
      messages: Annotation<BaseMessage[]>,
    });
  }

  create() {
    const llm = new ChatOpenAI({
      model: "gpt-5",
      temperature: 0,
      apiKey: this.configService.openaiApiKey,
    });

    const sshService = new CodespaceSSHService(this.configService, this.loggerService);
    sshService.connect(this.codespaceName);
    const tools = [new RemoteBashCommandTool(this.loggerService, sshService)];

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
