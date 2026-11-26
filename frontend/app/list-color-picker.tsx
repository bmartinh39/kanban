import type { KeyboardEvent, PointerEvent } from "react";
import { hexToHueSaturation, hslToHex, listSwatches } from "./list-colors";

const keySteps: Record<string, [hue: number, saturation: number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1],
};

/**
 * A hue wheel (angle is hue, distance from the center is saturation) above a row of common colors
 * (issue #51). Arrow keys turn the wheel (Left/Right) and change saturation (Up/Down); Shift takes bigger steps.
 */
export function ListColorPicker({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const { hue, saturation } = hexToHueSaturation(color);
  const radians = hue * Math.PI / 180;

  function pick(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - (box.left + box.width / 2);
    const y = event.clientY - (box.top + box.height / 2);
    const angle = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
    onChange(hslToHex(Math.round(angle), Math.round(Math.min(1, Math.hypot(x, y) / (box.width / 2)) * 100)));
  }

  function nudge(event: KeyboardEvent<HTMLDivElement>) {
    const step = keySteps[event.key];
    if (!step) return;
    event.preventDefault();
    const size = event.shiftKey ? 15 : 5;
    onChange(hslToHex((hue + step[0] * size + 360) % 360, Math.max(0, Math.min(100, saturation + step[1] * size))));
  }

  return <fieldset className="color-picker">
    <legend>Color</legend>
    <div
      className="color-wheel"
      role="slider"
      tabIndex={0}
      aria-label="Color wheel"
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={hue}
      aria-valuetext={`Hue ${hue} degrees, saturation ${saturation} percent`}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); pick(event); }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event); }}
      onKeyDown={nudge}
    >
      <span
        className="color-wheel-marker"
        style={{ left: `${50 + Math.sin(radians) * saturation / 2}%`, top: `${50 - Math.cos(radians) * saturation / 2}%`, background: color }}
      />
    </div>
    <div className="color-swatches" role="group" aria-label="Common colors">
      {listSwatches.map(swatch => <button
        key={swatch.color}
        type="button"
        aria-label={swatch.name}
        aria-pressed={swatch.color === color}
        style={{ background: swatch.color }}
        onClick={() => onChange(swatch.color)}
      />)}
    </div>
  </fieldset>;
}
