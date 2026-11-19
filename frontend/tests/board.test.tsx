import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import Home from "../app/page";

describe("board interface", () => {
  it("confirms populated list deletion, cancels without changes, then deletes its cards too", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.click(await screen.findByRole("button", { name: "Delete list Ideas" }));
    const dialog = screen.getByRole("dialog", { name: "Delete this list?" });
    expect(dialog).toHaveTextContent("also deletes its 3 cards");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getAllByRole("article")).toHaveLength(12);
    await user.click(screen.getByRole("button", { name: "Delete list Ideas" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete list" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Ideas column" })).not.toBeInTheDocument());
    expect(screen.getAllByRole("article")).toHaveLength(9);
    expect(screen.getByText("4 stages")).toBeInTheDocument();
  });
  it("confirms empty list deletion before changing the board", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.click(await screen.findByRole("button", { name: "Add list" }));
    await user.type(screen.getByLabelText(/List name/), "Empty{Enter}");
    await user.click(await screen.findByRole("button", { name: "Delete list Empty" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Delete the empty list Empty?");
    expect(screen.getByRole("region", { name: "Empty column" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete list" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Empty column" })).not.toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Empty column" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(12);
  });
  it("validates list names, creates an empty sixth list, renames it and adds a card", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.click(await screen.findByRole("button", { name: "Add list" }));
    const name = screen.getByLabelText(/List name/);
    expect(name).toHaveFocus();
    expect(screen.getByRole("button", { name: "Create list" })).toBeDisabled();
    await user.type(name, "   ");
    fireEvent.submit(name.closest("form")!);
    expect(screen.getAllByRole("region", { name: / column$/ })).toHaveLength(5);
    await user.clear(name);
    await user.type(name, "  Released  {Enter}");
    const list = await screen.findByRole("region", { name: "Released column" });
    expect(within(list).queryAllByRole("article")).toHaveLength(0);
    expect(screen.getByText("6 stages")).toBeInTheDocument();
    expect(screen.getByText("12 cards")).toBeInTheDocument();
    await user.click(within(list).getByRole("button", { name: "Rename Released" }));
    await user.clear(screen.getByLabelText("Column name"));
    await user.type(screen.getByLabelText("Column name"), "Shipped{Enter}");
    await user.click(within(list).getByRole("button", { name: "Add a card" }));
    await user.type(screen.getByLabelText(/Title/), "New task{Enter}");
    expect(within(list).getByRole("heading", { name: "New task" })).toBeInTheDocument();
    expect(screen.getByText("13 cards")).toBeInTheDocument();
  });
  it.each(["Cancel", "Close dialog", "backdrop", "Escape"])("cancels list creation with %s", async method => {
    const user = userEvent.setup();
    render(<Home />);
    await user.click(await screen.findByRole("button", { name: "Add list" }));
    await user.type(screen.getByLabelText(/List name/), "Discarded");
    if (method === "backdrop") fireEvent.click(screen.getByRole("dialog"));
    else if (method === "Escape") fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true }));
    else await user.click(screen.getByRole("button", { name: method }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: / column$/ })).toHaveLength(5);
    expect(screen.getByText("5 stages")).toBeInTheDocument();
  });
  it("renders exactly five populated columns", async () => {
    render(<Home />);
    await screen.findByRole("button", { name: "Rename Ideas" });
    expect(screen.getAllByRole("region", { name: / column$/ })).toHaveLength(5);
    expect(screen.getAllByRole("article")).toHaveLength(12);
    expect(screen.getByText("12 cards")).toBeInTheDocument();
  });
  it("announces the picked-up card title and its current position", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await screen.findByRole("button", { name: "Rename Ideas" });
    const handle = screen.getByRole("button", { name: "Move Give the homepage a fresh start" });
    handle.focus();
    await user.keyboard("[Space]");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Picked up Give the homepage a fresh start in Ideas, position 1 of 3.",
    );
    await user.keyboard("[Space]");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Dropped Give the homepage a fresh start in Ideas, position 1 of 3.",
    );
  });
  it("validates card creation, saves title and details, and updates the selected column", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await screen.findByRole("button", { name: "Rename Ideas" });
    const column = screen.getByRole("region", { name: "Planned column" });
    await user.click(within(column).getByRole("button", { name: "Add a card" }));
    expect(screen.getByRole("button", { name: "Add card" })).toBeDisabled();
    await user.type(screen.getByLabelText(/Title/), "   ");
    expect(screen.getByRole("button", { name: "Add card" })).toBeDisabled();
    await user.clear(screen.getByLabelText(/Title/));
    await user.type(screen.getByLabelText(/Title/), "  Test task  ");
    await user.type(screen.getByLabelText(/Details/), "Useful context");
    await user.click(screen.getByRole("button", { name: "Add card" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(column).getByRole("heading", { name: "Test task" })).toBeInTheDocument();
    expect(within(column).getByText("Useful context")).toBeInTheDocument();
    expect(screen.getByText("13 cards")).toBeInTheDocument();
  });
  it("supports title-only cards", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await screen.findByRole("button", { name: "Rename Ideas" });
    await user.click(screen.getAllByRole("button", { name: "Add a card" })[0]);
    await user.type(screen.getByLabelText(/Title/), "Title only");
    await user.click(screen.getByRole("button", { name: "Add card" }));
    expect(screen.getByRole("heading", { name: "Title only" })).toBeInTheDocument();
  });
  it.each(["Cancel", "Close dialog", "backdrop", "Escape"])("cancels creation with %s without adding a card", async method => {
    const user = userEvent.setup();
    render(<Home />);
    await screen.findByRole("button", { name: "Rename Ideas" });
    await user.click(screen.getAllByRole("button", { name: "Add a card" })[0]);
    await user.type(screen.getByLabelText(/Title/), "Do not save");
    if (method === "backdrop") fireEvent.click(screen.getByRole("dialog"));
    else if (method === "Escape") fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true }));
    else await user.click(screen.getByRole("button", { name: method }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(12);
  });
  it("renames a column, rejects whitespace, and cancels subsequent changes", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await screen.findByRole("button", { name: "Rename Ideas" });
    await user.click(screen.getByRole("button", { name: "Rename Ideas" }));
    await user.clear(screen.getByLabelText("Column name"));
    await user.type(screen.getByLabelText("Column name"), "  ");
    expect(screen.getByRole("button", { name: "Save column name" })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText("Column name").closest("form")!);
    expect(screen.getByLabelText("Column name")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Column name"));
    await user.type(screen.getByLabelText("Column name"), "Backlog{Enter}");
    expect(screen.getByRole("region", { name: "Backlog column" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Rename Backlog" }));
    await user.type(screen.getByLabelText("Column name"), " discarded{Escape}");
    expect(screen.getByRole("region", { name: "Backlog column" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Rename Backlog" }));
    await user.click(screen.getByRole("button", { name: "Cancel rename" }));
    expect(screen.getAllByRole("region", { name: / column$/ })).toHaveLength(5);
  });
  it("deletes intended cards and exposes an empty-column state", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await screen.findByRole("button", { name: "Rename Ideas" });
    const done = screen.getByRole("region", { name: "Done column" });
    for (const article of within(done).getAllByRole("article")) await user.click(within(article).getByRole("button", { name: /^Delete / }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(within(done).queryAllByRole("article")).toHaveLength(0);
    expect(within(done).getByText("Drop a card here or add one below.")).toBeInTheDocument();
    expect(screen.getByText("10 cards")).toBeInTheDocument();
  });
  it("keeps keyboard focus within the creation dialog in both directions", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await screen.findByRole("button", { name: "Rename Ideas" });
    await user.click(screen.getAllByRole("button", { name: "Add a card" })[0]);
    expect(screen.getByLabelText(/Title/)).toHaveFocus();
    const close = screen.getByRole("button", { name: "Close dialog" });
    close.focus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(close).toHaveFocus();
    await user.type(screen.getByLabelText(/Title/), "Task");
    screen.getByRole("button", { name: "Add card" }).focus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(close).toHaveFocus();
  });
});
