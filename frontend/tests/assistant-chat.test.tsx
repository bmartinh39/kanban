import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Home from "../app/page";
import { controlledBoard } from "./controlled-board";
import { initialBoard } from "../app/board-state";
import { AssistantChat } from "../app/assistant-chat";

const command = { type: "create", list: "Ideas", sourceList: null, card: null, title: "Launch", details: null };
afterEach(() => vi.unstubAllGlobals());

async function openChat() {
  const user = userEvent.setup();
  render(<Home />);
  await screen.findByRole("region", { name: "Board assistant" });
  return user;
}

describe("assistant chat", () => {
  it.each([true, false])("requires confirmation before any action in a deletion batch; confirmed=%s", async confirmed => {
    const fetcher = controlledBoard(vi.fn().mockResolvedValue(Response.json({ message: "Already deleted, no confirmation needed", operations: [
      { ...command, type: "create-list", list: null, title: "New stage" },
      { ...command, type: "delete-list", title: null },
    ] })));
    const user = await openChat();
    const input = screen.getByLabelText("What would you like to change?");
    await user.type(input, "Create New stage and delete Ideas{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "Delete this list?" });
    expect(dialog).toHaveTextContent("Ideas also deletes its 3 cards");
    expect(screen.getAllByRole("article", { hidden: true })).toHaveLength(12);
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/board/actions")).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: confirmed ? "Delete list" : "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    if (confirmed) {
      await waitFor(() => expect(screen.getByRole("log")).toHaveTextContent('Deleted list "Ideas"'));
      expect(screen.getAllByRole("article")).toHaveLength(9);
      expect(screen.getByRole("region", { name: "New stage column" })).toBeInTheDocument();
      expect(fetcher.mock.calls.filter(([url]) => url === "/api/board/actions")).toHaveLength(1);
    } else {
      expect(await screen.findByText("Cancelled. No changes were made.")).toBeInTheDocument();
      expect(screen.getAllByRole("article")).toHaveLength(12);
      expect(screen.queryByRole("region", { name: "New stage column" })).not.toBeInTheDocument();
      expect(fetcher.mock.calls.filter(([url]) => url === "/api/board/actions")).toHaveLength(0);
    }
    expect(input).toHaveFocus();
  });
  it("sends a multiline draft with Enter and keeps focus in the composer", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ message: "Which card?", operations: [] }));
    controlledBoard(fetcher);
    const user = await openChat();
    const input = screen.getByLabelText("What would you like to change?");
    await user.type(input, "Move a card");
    await user.keyboard("{Shift>}{Enter}{/Shift}to Done");
    expect(input).toHaveValue("Move a card\nto Done");
    expect(fetcher).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Which card?")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).messages).toEqual([{ role: "user", content: "Move a card\nto Done" }]);
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });
  it("does not send blank drafts, composition confirmation, held Enter, or another request while busy", async () => {
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    controlledBoard(fetcher);
    const user = await openChat();
    const input = screen.getByLabelText("What would you like to change?");
    await user.type(input, "   {Enter}");
    expect(fetcher).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, "Move a card");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    fireEvent.keyDown(input, { key: "Enter", repeat: true });
    expect(fetcher).not.toHaveBeenCalled();
    expect(input).toHaveValue("Move a card");
    await user.keyboard("{Enter}");
    await screen.findByText("Thinking about your board...");
    await user.type(input, "Another request{Enter}");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("Another request");
  });
  it("does not submit with Enter while board changes are disabled", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<AssistantChat drawerOpen={false} onCloseDrawer={vi.fn()} board={initialBoard} revision={0} disabled onRefresh={vi.fn()} onApply={vi.fn()} />);
    const input = screen.getByLabelText("What would you like to change?");
    await user.type(input, "Create a card{Enter}");
    expect(fetcher).not.toHaveBeenCalled();
    expect(input).toHaveValue("Create a card");
  });
  it("stays visible, identifies itself as AI and supports keyboard input", async () => {
    const user = await openChat();
    expect(screen.getByRole("heading", { name: "AI Assistant" })).toBeInTheDocument();
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
    expect(screen.getAllByRole("article")).toHaveLength(13);
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
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete card" }));
    resolve(Response.json({ message: "Done", operations: [command] }));
    expect(await screen.findByRole("alert")).toHaveTextContent("board changed");
    expect(screen.getAllByRole("article")).toHaveLength(11);
    expect(screen.queryByRole("heading", { name: "Launch" })).not.toBeInTheDocument();
  });
});
