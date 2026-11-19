import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { controlledBoard } from "./controlled-board";

beforeEach(() => { controlledBoard(); });

afterEach(cleanup);
// jsdom has no native modal dialog implementation. Browser tests cover focus trapping.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.scrollTo = vi.fn();
