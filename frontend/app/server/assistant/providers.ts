import { AssistantConfigurationError, type AssistantProvider } from "./provider";
import { ResponsesProvider } from "./responses-provider";

const providers = {
  openai: {
    endpoint: "https://api.openai.com/v1/responses",
    keyVariable: "OPENAI_API_KEY",
    defaultModel: "gpt-6-luna",
    requireParameters: false,
  },
  openrouter: {
    endpoint: "https://openrouter.ai/api/v1/responses",
    keyVariable: "OPENROUTER_API_KEY",
    defaultModel: "openrouter/free",
    requireParameters: true,
  },
} as const;

export function createAssistantProvider(env: Record<string, string | undefined> = process.env): AssistantProvider {
  const name = env.AI_PROVIDER?.trim() || "openai";
  if (name !== "openai" && name !== "openrouter") {
    throw new AssistantConfigurationError("AI_PROVIDER must be openai or openrouter. Update the server configuration.");
  }
  const config = providers[name];
  const apiKey = env[config.keyVariable]?.trim();
  if (!apiKey) {
    throw new AssistantConfigurationError(`The assistant is not configured yet. Set ${config.keyVariable} on the server to enable it.`);
  }
  // Preserve existing OpenAI installations while offering one model setting
  // for every provider. Never reuse an OpenAI model name for OpenRouter.
  const model = env.AI_MODEL?.trim() || (name === "openai" ? env.OPENAI_MODEL?.trim() : undefined) || config.defaultModel;
  return new ResponsesProvider({ ...config, apiKey, model });
}
