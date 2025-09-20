import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { RunnableConfig } from '@langchain/core/runnables';
import { Annotation, CompiledStateGraph, END, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { last } from 'lodash-es';
import { ContainerProviderEntity } from '../entities/containerProvider.entity';
import { CallModelNode } from '../nodes/callModel.node';
import { ToolsNode } from '../nodes/tools.node';
import { CheckpointerService } from '../services/checkpointer.service';
import { ConfigService } from '../services/config.service';
import { LoggerService } from '../services/logger.service';
import { SlackService } from '../services/slack.service';
import { BaseAgent } from './base.agent';

export class SimpleAgent extends BaseAgent {
  private callModelNode!: CallModelNode;
  private toolsNode!: ToolsNode;

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
      model: 'gpt-5',
      apiKey: this.configService.openaiApiKey,
    });

    this.callModelNode = new CallModelNode([], llm);
    this.toolsNode = new ToolsNode([]);

    const builder = new StateGraph(
      {
        stateSchema: this.state(),
      },
      this.configuration(),
    )
      .addNode('call_model', this.callModelNode.action.bind(this.callModelNode))
      .addNode('tools', this.toolsNode.action.bind(this.toolsNode))
      .addEdge(START, 'call_model')
      .addConditionalEdges(
        'call_model',
        (state) => (last(state.messages as AIMessage[])?.tool_calls?.length ? 'tools' : END),
        {
          tools: 'tools',
          [END]: END,
        },
      )
      .addEdge('tools', 'call_model');
    this._graph = builder.compile({ checkpointer: this.checkpointerService.getCheckpointer() }) as CompiledStateGraph<
      unknown,
      unknown
    >;

    return this;
  }

  addTool(tool: any) {
    // using any to avoid circular import issues if BaseTool is extended differently later
    this.callModelNode.addTool(tool);
    this.toolsNode.addTool(tool);
    this.loggerService.info(`Tool added to ArchitectAgent: ${tool?.constructor?.name || 'UnknownTool'}`);
  }

  removeTool(tool: any) {
    this.callModelNode.removeTool(tool);
    this.toolsNode.removeTool(tool);
    this.loggerService.info(`Tool removed from ArchitectAgent: ${tool?.constructor?.name || 'UnknownTool'}`);
  }

  /**
   * Dynamically set configuration values like the system prompt.
   */
  setConfig(config: Record<string, unknown>): void {
    const parsedConfig = config as { systemPrompt?: string }; // TODO: fix
    if (parsedConfig.systemPrompt !== undefined) {
      this.callModelNode.setSystemPrompt(parsedConfig.systemPrompt);
      this.loggerService.info('ArchitectAgent system prompt updated');
    }
  }
}
