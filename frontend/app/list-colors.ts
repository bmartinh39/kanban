// List dot colors (issue #51). The first five swatches are the colors lists had by position before colors
// were stored, so new lists continue the same rotation.
export const listSwatches = [
  { name: "Grey", color: "#b0b9c8" },
  { name: "Blue", color: "#79bdf0" },
  { name: "Indigo", color: "#8f98f6" },
  { name: "Violet", color: "#c08cf0" },
  { name: "Cyan", color: "#5ccfe6" },
  { name: "Green", color: "#6fd6a8" },
  { name: "Yellow", color: "#ecad0a" },
  { name: "Orange", color: "#f2a65a" },
  { name: "Coral", color: "#f07a8a" },
  { name: "Pink", color: "#e98bd0" },
] as const;

export const isListColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/.test(value);

/** The default color for a new list, following the swatch rotation by list count. */
export const nextListColor = (listCount: number) => listSwatches[listCount % listSwatches.length].color;

/** The wheel keeps one lightness so every color it offers stays visible on the dark board. */
export const wheelLightness = 70;

export function hslToHex(hue: number, saturation: number, lightness = wheelLightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** Hue (degrees) and saturation (percent) of a hex color, for placing the wheel marker. */
export function hexToHueSaturation(hex: string) {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  const hue = delta === 0 ? 0
    : max === r ? 60 * (((g - b) / delta) % 6)
    : max === g ? 60 * ((b - r) / delta + 2)
    : 60 * ((r - g) / delta + 4);
  return { hue: Math.round((hue + 360) % 360), saturation: Math.round(saturation * 100) };
}
