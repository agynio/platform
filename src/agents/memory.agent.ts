// // Main graph
// import { AIMessage, BaseMessage } from "@langchain/core/messages";
// import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
// import { ChatOpenAI } from "@langchain/openai";

// import { last } from "lodash-es";
// import { MemoryCallModelNode } from "../nodes/memoryCallModel.node.js";
// import { ToolsNode } from "../nodes/tools.node.js";
// import { ConfigService } from "../services/config.service.js";
// import { UpsertMemoryTool } from "../tools/upsert_memory.tool.js";
// import { BaseAgent } from "./base.agent.js";

// export class MemoryAgent extends BaseAgent {
//   constructor(private configService: ConfigService) {
//     super();
//   }
//   protected state() {
//     return Annotation.Root({
//       messages: Annotation<BaseMessage[]>,
//     });
//   }

//   create() {
//     const llm = new ChatOpenAI({
//       model: "gpt-4o-mini",
//       temperature: 0,
//       apiKey: this.configService.openaiApiKey,
//     });

//     const tools = [new UpsertMemoryTool()];
//     const memoryCallModelNode = new MemoryCallModelNode(tools, llm);
//     const toolsNode = new ToolsNode(tools);

//     const builder = new StateGraph(
//       {
//         stateSchema: this.state(),
//       },
//       this.configuration(),
//     )
//       .addNode("call_model", memoryCallModelNode.action.bind(memoryCallModelNode))
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

//     const graph = builder.compile();

//     return graph;
//   }
// }
