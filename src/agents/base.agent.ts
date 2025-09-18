import { BaseMessage } from "@langchain/core/messages";
import { Annotation, AnnotationRoot, Messages, messagesStateReducer } from "@langchain/langgraph";

export abstract class BaseAgent {
  protected state(): AnnotationRoot<{}> {
    return Annotation.Root({
      messages: Annotation<BaseMessage[], Messages>({
        reducer: messagesStateReducer,
        default: () => [],
      }),
    });
  }

  protected configuration(): AnnotationRoot<{}> {
    return Annotation.Root({
      // systemPrompt: Annotation<string>(),
    });
  }
}
