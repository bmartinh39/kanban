import { describe, expect, it } from "vitest";
import { hexToHueSaturation, hslToHex, isListColor, listSwatches, nextListColor } from "../app/list-colors";

describe("list colors", () => {
  it("continues the swatch rotation by list count", () => {
    expect([0, 4, 5, 10].map(nextListColor)).toEqual(["#b0b9c8", "#5ccfe6", "#6fd6a8", "#b0b9c8"]);
    expect(listSwatches.every(swatch => isListColor(swatch.color))).toBe(true);
  });

  it("accepts only lowercase #rrggbb", () => {
    expect(["#6fd6a8", "#000000"].every(isListColor)).toBe(true);
    expect(["#6FD6A8", "#fff", "red", "#6fd6a8 ", 42, null].some(isListColor)).toBe(false);
  });

  it("converts wheel positions to fixed-lightness colors and back", () => {
    expect(hslToHex(0, 100)).toBe("#ff6666");
    expect(hslToHex(120, 0)).toBe("#b3b3b3");
    expect(hslToHex(210, 80)).toBe("#75b3f0");
    expect(hexToHueSaturation("#75b3f0")).toEqual({ hue: 210, saturation: 80 });
    expect(hexToHueSaturation("#ff6666")).toEqual({ hue: 0, saturation: 100 });
    expect(hexToHueSaturation("#b3b3b3")).toEqual({ hue: 0, saturation: 0 });
  });
});
