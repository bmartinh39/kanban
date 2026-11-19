import type { AssistantPlan, ChatMessage } from "../../assistant-commands";
import type { Column } from "../../board-state";

export type AssistantRequest = {
  instructions: string;
  board: Column[];
  messages: ChatMessage[];
};

export interface AssistantProvider {
  generatePlan(request: AssistantRequest): Promise<AssistantPlan>;
}

export class AssistantConfigurationError extends Error {}

export class AssistantConnectionError extends Error {
  constructor(timedOut: boolean) {
    super(timedOut
      ? "The AI provider took too long to respond. Try again. No changes were made."
      : "The assistant server could not reach the AI provider. Check the server's internet access and try again. No changes were made.");
  }
}
