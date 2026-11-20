import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { controlledBoard } from "./controlled-board";

beforeEach(() => { controlledBoard(); });

afterEach(cleanup);
// jsdom has no native modal dialog implementation. Browser tests cover focus trapping.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.show = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
window.matchMedia = vi.fn(query => ({
  media: query, matches: false, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
}));
global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.scrollTo = vi.fn();
HTMLElement.prototype.scrollIntoView = vi.fn();
// jsdom does not animate; browser regressions verify the actual entrance/exit.
HTMLElement.prototype.getAnimations = () => [];
