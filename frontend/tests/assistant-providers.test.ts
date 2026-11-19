import { afterEach, describe, expect, it, vi } from "vitest";
import { createAssistantProvider } from "../app/server/assistant/providers";
import { AssistantConfigurationError, type AssistantRequest } from "../app/server/assistant/provider";
import { initialBoard } from "../app/board-state";

const plan = { message: "Which card?", operations: [] };
const request: AssistantRequest = {
  instructions: "Board instructions",
  board: initialBoard,
  messages: [{ role: "user", content: "Move that card" }],
};
const configs = [
  { name: "openai", keyVariable: "OPENAI_API_KEY", endpoint: "https://api.openai.com/v1/responses", defaultModel: "gpt-6-luna" },
  { name: "openrouter", keyVariable: "OPENROUTER_API_KEY", endpoint: "https://openrouter.ai/api/v1/responses", defaultModel: "openrouter/free" },
];
function response(value: unknown = plan, status = "completed") {
  return Response.json({ status, output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
}
afterEach(() => vi.unstubAllGlobals());

describe.each(configs)("$name provider contract", config => {
  const env = { AI_PROVIDER: config.name, [config.keyVariable]: "selected-secret", OPENAI_MODEL: "" };

  it("returns the same domain plan with only the selected provider's credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetcher);
    const provider = createAssistantProvider({ ...env, AI_MODEL: "chosen-model" });
    expect(await provider.generatePlan(request)).toEqual(plan);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(config.endpoint);
    expect(options.headers.Authorization).toBe("Bearer selected-secret");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    const sent = JSON.parse(options.body);
    expect(sent).toMatchObject({ model: "chosen-model", store: false, instructions: request.instructions,
      text: { format: { type: "json_schema", strict: true } } });
    expect(sent.input[0].content).toContain(JSON.stringify(initialBoard));
    expect(sent.input.at(-1)).toEqual(request.messages[0]);
    expect(sent.provider).toEqual(config.name === "openrouter" ? { require_parameters: true } : undefined);
    expect(JSON.stringify(sent)).not.toContain("selected-secret");
  });
  it("uses its default model when the shared model setting is blank", async () => {
    const fetcher = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetcher);
    await createAssistantProvider({ ...env, AI_MODEL: "  " }).generatePlan(request);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBe(config.defaultModel);
  });
  it("requires its own key without falling back to another provider", () => {
    expect(() => createAssistantProvider({ AI_PROVIDER: config.name })).toThrow(AssistantConfigurationError);
    expect(() => createAssistantProvider({ AI_PROVIDER: config.name, [config.keyVariable]: "  " })).toThrow(config.keyVariable);
  });
  it.each([
    () => Response.json({ error: "private details" }, { status: 429 }),
    () => response(plan, "incomplete"),
    () => Response.json(null),
    () => Response.json({ status: "completed", output: null }),
    () => Response.json({ status: "completed", output: [null, { type: "reasoning" }, { type: "message", content: null }] }),
    () => Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] }),
    () => response({ message: "Done", operations: [{ type: "delete" }] }),
    () => new Response("Invalid JSON"),
  ])("rejects upstream failures and invalid plans", async result => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(result()));
    await expect(createAssistantProvider(env).generatePlan(request)).rejects.toThrow();
  });
  it("propagates connection and timeout failures for the route to normalize", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError")));
    await expect(createAssistantProvider(env).generatePlan(request)).rejects.toThrow("Timed out");
  });
});

it("retains the legacy OpenAI model setting, with AI_MODEL taking precedence", async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(response()));
  vi.stubGlobal("fetch", fetcher);
  await createAssistantProvider({ OPENAI_API_KEY: "key", OPENAI_MODEL: "legacy" }).generatePlan(request);
  await createAssistantProvider({ OPENAI_API_KEY: "key", OPENAI_MODEL: "legacy", AI_MODEL: "shared" }).generatePlan(request);
  await createAssistantProvider({ AI_PROVIDER: "openrouter", OPENROUTER_API_KEY: "key", OPENAI_MODEL: "legacy" }).generatePlan(request);
  expect(fetcher.mock.calls.map(([, options]) => JSON.parse(options.body).model)).toEqual(["legacy", "shared", "openrouter/free"]);
});

it("rejects unsupported provider names without making any requests", () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  expect(() => createAssistantProvider({ AI_PROVIDER: "missing" })).toThrow("AI_PROVIDER must be openai or openrouter");
  expect(fetcher).not.toHaveBeenCalled();
});
