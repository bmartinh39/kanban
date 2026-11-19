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
