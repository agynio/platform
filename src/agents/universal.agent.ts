// import { AIMessage, BaseMessage } from "@langchain/core/messages";
// import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
// import { ChatOpenAI } from "@langchain/openai";
// import { last } from "lodash-es";
// import { CallModelNode } from "../nodes/callModel.node";
// import { ToolsNode } from "../nodes/tools.node";
// import { ConfigService } from "../services/config.service";
// import { BaseTool } from "../tools/base.tool";
// import { BaseAgent } from "./base.agent";

// export class UniversalAgent extends BaseAgent {
//   constructor(private configService: ConfigService) {
//     super();
//   }

//   protected state() {
//     return Annotation.Root({
//       messages: Annotation<BaseMessage[]>,
//     });
//   }

//   create(tools: BaseTool[]) {
//     const llm = new ChatOpenAI({
//       model: "gpt-5",
//       apiKey: this.configService.openaiApiKey,
//     });

//     const callModelNode = new CallModelNode(tools, llm);
//     const toolsNode = new ToolsNode(tools);

//     const builder = new StateGraph(
//       {
//         stateSchema: this.state(),
//       },
//       this.configuration(),
//     )
//       .addNode("call_model", callModelNode.action.bind(callModelNode))
//       .addNode("tools", toolsNode.action.bind(toolsNode))
//       .addEdge(START, "call_model")
//       .addConditionalEdges(
//         "call_model",
//         (state) => (last(state.messages as AIMessage[])?.tool_calls?.length ? "tools" : END),
//         {
//           tools: "tools",
//           [END]: END,
//         },
//       )
//       .addEdge("tools", "call_model");

//     const graph = builder.compile({ checkpointer: new MemorySaver() });

//     return graph;
//   }
// }
