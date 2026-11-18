import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import Home from "../app/page";

describe("board interface", () => {
  it("renders exactly five populated columns", () => {
    render(<Home />);
    expect(screen.getAllByRole("region", { name: / column$/ })).toHaveLength(5);
    expect(screen.getAllByRole("article")).toHaveLength(12);
    expect(screen.getByText("12 cards")).toBeInTheDocument();
  });
  it("announces the picked-up card title and its current position", async () => {
    const user = userEvent.setup();
    render(<Home />);
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
    await user.click(screen.getAllByRole("button", { name: "Add a card" })[0]);
    await user.type(screen.getByLabelText(/Title/), "Title only");
    await user.click(screen.getByRole("button", { name: "Add card" }));
    expect(screen.getByRole("heading", { name: "Title only" })).toBeInTheDocument();
  });
  it.each(["Cancel", "Close dialog", "backdrop", "Escape"])("cancels creation with %s without adding a card", async method => {
    const user = userEvent.setup();
    render(<Home />);
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
    const done = screen.getByRole("region", { name: "Done column" });
    for (const button of within(done).getAllByRole("button", { name: /^Delete / })) await user.click(button);
    expect(within(done).queryAllByRole("article")).toHaveLength(0);
    expect(within(done).getByText("Drop a card here or add one below.")).toBeInTheDocument();
    expect(screen.getByText("10 cards")).toBeInTheDocument();
  });
  it("keeps keyboard focus within the creation dialog in both directions", async () => {
    const user = userEvent.setup();
    render(<Home />);
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
