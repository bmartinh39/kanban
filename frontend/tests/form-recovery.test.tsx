import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Home from "../app/page";

type Fetcher = (url: string, options?: RequestInit) => Promise<Response>;

// Wrap the controlled board API so a test can change how saves respond.
function interceptSaves(handler: (save: () => Promise<Response>, body: { actions: { type: string }[] }, attempt: number) => Promise<Response>) {
  const fetcher = vi.mocked(fetch);
  const real = fetcher.getMockImplementation() as Fetcher;
  let attempt = 0;
  fetcher.mockImplementation(async (url, options) => {
    if (url !== "/api/board/actions") return real(url as string, options);
    return handler(() => real(url as string, options), JSON.parse(options!.body as string), ++attempt);
  });
  return () => fetcher.mock.calls.filter(([url]) => url === "/api/board/actions").length;
}

async function openCardDialog(user: ReturnType<typeof userEvent.setup>) {
  render(<Home />);
  const column = await screen.findByRole("region", { name: "Planned column" });
  await user.click(within(column).getByRole("button", { name: "Add a card" }));
  await user.type(screen.getByLabelText(/Title/), "Draft task");
  await user.type(screen.getByLabelText(/Details/), "Draft details");
  return column;
}

describe("forms keep drafts until saves succeed (issue #17)", () => {
  it.each([
    [400, "Invalid board action."],
    [409, "The board changed. Reload and retry."],
  ])("keeps the card draft and shows the error after HTTP %i", async (status, message) => {
    const user = userEvent.setup();
    const writes = interceptSaves(async () => Response.json({ error: message }, { status }));
    const column = await openCardDialog(user);
    await user.click(screen.getByRole("button", { name: "Add card" }));
    const dialog = screen.getByRole("dialog", { name: "Add a card" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText(/Title/)).toHaveValue("Draft task");
    expect(screen.getByLabelText(/Details/)).toHaveValue("Draft details");
    expect(within(column).queryByRole("heading", { name: "Draft task" })).not.toBeInTheDocument();
    expect(writes()).toBe(1);
  });

  it("closes once when a lost response is read back as committed, without a duplicate", async () => {
    const user = userEvent.setup();
    const writes = interceptSaves(async save => { await save(); throw new TypeError("Failed to fetch"); });
    const column = await openCardDialog(user);
    await user.click(screen.getByRole("button", { name: "Add card" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(column).getAllByRole("heading", { name: "Draft task" })).toHaveLength(1);
    expect(writes()).toBe(1);
  });

  it("keeps the draft when the outcome cannot be confirmed, and a retry reuses the same card ID", async () => {
    const user = userEvent.setup();
    const ids: string[] = [];
    const writes = interceptSaves(async (save, body, attempt) => {
      ids.push((body.actions[0] as unknown as { card: { id: string } }).card.id);
      if (attempt === 1) throw new TypeError("Failed to fetch");
      return save();
    });
    const column = await openCardDialog(user);
    await user.click(screen.getByRole("button", { name: "Add card" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("could not be confirmed");
    expect(screen.getByLabelText(/Title/)).toHaveValue("Draft task");
    await user.click(screen.getByRole("button", { name: "Add card" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(column).getAllByRole("heading", { name: "Draft task" })).toHaveLength(1);
    expect(writes()).toBe(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it("prevents a double submit while the save is pending", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const writes = interceptSaves(async save => { await new Promise<void>(resolve => { release = resolve; }); return save(); });
    await openCardDialog(user);
    const submit = screen.getByRole("button", { name: "Add card" });
    await user.click(submit);
    expect(screen.getByRole("button", { name: /Saving/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Saving/ }));
    await user.keyboard("{Enter}");
    expect(writes()).toBe(1);
    release();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes()).toBe(1);
  });

  it("keeps the list name draft when list creation is rejected", async () => {
    const user = userEvent.setup();
    interceptSaves(async () => Response.json({ error: "The board changed. Reload and retry." }, { status: 409 }));
    render(<Home />);
    await user.click(await screen.findByRole("button", { name: "Add list" }));
    await user.type(screen.getByLabelText(/List name/), "Released");
    await user.click(screen.getByRole("button", { name: "Create list" }));
    expect(await screen.findByText("The board changed. Reload and retry.", { selector: ".form-error" })).toBeInTheDocument();
    expect(screen.getByLabelText(/List name/)).toHaveValue("Released");
    expect(screen.queryByRole("region", { name: "Released column" })).not.toBeInTheDocument();
  });

  it("keeps the rename editor and draft on failure, then closes after a successful retry", async () => {
    const user = userEvent.setup();
    interceptSaves(async (save, _body, attempt) => attempt === 1 ? Response.json({ error: "Invalid board action." }, { status: 400 }) : save());
    render(<Home />);
    await user.click(await screen.findByRole("button", { name: "Rename Ideas" }));
    const input = screen.getByRole("textbox", { name: "Column name" });
    await user.clear(input);
    await user.type(input, "Backlog{Enter}");
    const column = screen.getByRole("region", { name: "Ideas column" });
    expect(await within(column).findByRole("alert")).toHaveTextContent("Invalid board action.");
    expect(input).toHaveValue("Backlog");
    expect(input).toHaveAttribute("aria-invalid", "true");
    await user.type(input, "{Enter}");
    expect(await screen.findByRole("region", { name: "Backlog column" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Column name" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Rename Backlog" })).toHaveFocus());
  });
});
