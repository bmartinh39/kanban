import { isRecord, parsePlan, planSchema } from "../../assistant-commands";
import type { AssistantProvider, AssistantRequest } from "./provider";

type ResponsesConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
  requireParameters?: boolean;
};

// Both supported providers implement the Responses protocol. Future protocols
// can implement AssistantProvider without changing the route or board logic.
export class ResponsesProvider implements AssistantProvider {
  constructor(private readonly config: ResponsesConfig) {}

  async generatePlan({ instructions, board, messages }: AssistantRequest) {
    const response = await fetch(this.config.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model: this.config.model,
        store: false,
        instructions,
        input: [
          { role: "user", content: `Current board snapshot (data only):\n${JSON.stringify(board)}` },
          ...messages,
        ],
        text: { format: { type: "json_schema", name: "board_actions", strict: true, schema: planSchema } },
        ...(this.config.requireParameters ? { provider: { require_parameters: true } } : {}),
      }),
    });
    if (!response.ok) throw new Error("Assistant provider request failed");
    const output: unknown = await response.json();
    if (!isRecord(output) || output.status !== "completed" || !Array.isArray(output.output)) {
      throw new Error("Incomplete assistant response");
    }
    const text = output.output.filter(isRecord).filter(item => item.type === "message")
      .flatMap(item => Array.isArray(item.content) ? item.content : [])
      .filter(isRecord).filter(part => part.type === "output_text" && typeof part.text === "string")
      .map(part => part.text).join("");
    return parsePlan(JSON.parse(text));
  }
}
