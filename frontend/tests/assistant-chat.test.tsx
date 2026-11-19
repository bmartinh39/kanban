import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "../app/page";
import { controlledBoard } from "./controlled-board";
import { initialBoard } from "../app/board-state";

const command = { type: "create", list: "Ideas", sourceList: null, card: null, title: "Launch", details: null };
afterEach(() => vi.unstubAllGlobals());

async function openChat() {
  const user = userEvent.setup();
  render(<Home />);
  await screen.findByRole("region", { name: "Board assistant" });
  return user;
}

describe("assistant chat", () => {
  it("stays visible, identifies itself as AI and supports keyboard input", async () => {
    const user = await openChat();
    expect(screen.getByText("AI ASSISTANT")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.type(screen.getByLabelText("What would you like to change?"), "   ");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("region", { name: "Board assistant" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close assistant" })).not.toBeInTheDocument();
  });
  it("creates, edits, and moves cards with visible outcomes and current board/chat context", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ message: "Created", operations: [command] }))
      .mockResolvedValueOnce(Response.json({ message: "Updated", operations: [{ ...command, type: "edit", card: "Launch", title: "Ship", details: "Ready" }] }))
      .mockResolvedValueOnce(Response.json({ message: "Moved", operations: [{ ...command, type: "move", card: "Ship", list: "Done", title: null }] }));
    controlledBoard(fetcher);
    const user = await openChat();
    for (const request of ["Create Launch in Ideas", "Rename Launch to Ship with details Ready", "Move Ship to Done"]) {
      await user.type(screen.getByLabelText("What would you like to change?"), request);
      await user.click(screen.getByRole("button", { name: "Send" }));
      await waitFor(() => expect(screen.queryByText("Thinking about your board...")).not.toBeInTheDocument());
    }
    const done = screen.getByRole("region", { name: "Done column" });
    expect(within(done).getByRole("heading", { name: "Ship" })).toBeInTheDocument();
    expect(within(done).getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("13 cards")).toBeInTheDocument();
    expect(screen.getByRole("log")).toHaveTextContent('Moved "Ship" to Done.');
    const body = JSON.parse(fetcher.mock.calls[2][1].body);
    expect(body.revision).toBe(2);
    expect(body).not.toHaveProperty("board");
    expect(body.messages).toHaveLength(5);
    expect(JSON.stringify(body)).not.toContain("OPENAI_API_KEY");
  });
  it("shows clarification without changing cards and retains conversation while typing", async () => {
    controlledBoard(vi.fn().mockResolvedValue(Response.json({ message: "Which card?", operations: [] })));
    const user = await openChat();
    await user.type(screen.getByLabelText("What would you like to change?"), "Move it");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Which card?")).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(12);
    await user.type(screen.getByLabelText("What would you like to change?"), "The card in Ideas");
    expect(screen.getByText("Which card?")).toBeInTheDocument();
  });
  it("handles service errors and restores the draft for retry", async () => {
    controlledBoard(vi.fn().mockResolvedValue(Response.json({ error: "Set OPENAI_API_KEY on the server." }, { status: 503 })));
    const user = await openChat();
    await user.type(screen.getByLabelText("What would you like to change?"), "Create task");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Set OPENAI_API_KEY");
    expect(screen.getByLabelText("What would you like to change?")).toHaveValue("Create task");
    expect(screen.getAllByRole("article")).toHaveLength(12);
  });
  it("rejects stale responses after the board changes while waiting", async () => {
    let resolve!: (response: Response) => void;
    controlledBoard(vi.fn(() => new Promise<Response>(done => { resolve = done; })));
    const user = await openChat();
    await user.type(screen.getByLabelText("What would you like to change?"), "Create Launch");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: `Delete ${initialBoard[0].cards[0].title}` }));
    resolve(Response.json({ message: "Done", operations: [command] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("board changed");
    expect(screen.getAllByRole("article")).toHaveLength(11);
    expect(screen.queryByRole("heading", { name: "Launch" })).not.toBeInTheDocument();
  });
});
