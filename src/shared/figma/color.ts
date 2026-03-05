export const HEX_COLOR_PATTERN = /^#(?:[0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

function normalizeHexColor(hex: string): string {
  const normalized = hex.trim().replace(/^#/, "");
  const isValidLength = normalized.length === 3 || normalized.length === 4 || normalized.length === 6 || normalized.length === 8;
  if (!isValidLength) {
    throw new Error(`Invalid hex color: "${hex}"`);
  }
  return normalized;
}

function expandHexColor(normalizedHex: string): string {
  if (normalizedHex.length === 3 || normalizedHex.length === 4) {
    return normalizedHex
      .split("")
      .map((part) => `${part}${part}`)
      .join("");
  }
  return normalizedHex;
}

function channelToHex(value: number): string {
  const bounded = Math.max(0, Math.min(1, value));
  const intValue = Math.round(bounded * 255);
  return intValue.toString(16).padStart(2, "0");
}

export function rgbaToHex(color: RGB | RGBA): string {
  const red = channelToHex(color.r);
  const green = channelToHex(color.g);
  const blue = channelToHex(color.b);
  const alpha = "a" in color ? channelToHex(color.a) : "ff";
  if (alpha === "ff") {
    return `#${red}${green}${blue}`.toUpperCase();
  }
  return `#${red}${green}${blue}${alpha}`.toUpperCase();
}

export function hexToRgba(hex: string): RGBA {
  const normalizedHex = normalizeHexColor(hex);
  const expanded = expandHexColor(normalizedHex);

  const red = Number.parseInt(expanded.slice(0, 2), 16) / 255;
  const green = Number.parseInt(expanded.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(expanded.slice(4, 6), 16) / 255;
  const alpha = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1;

  if ([red, green, blue, alpha].some((value) => Number.isNaN(value))) {
    throw new Error(`Invalid hex color: "${hex}"`);
  }
  return { r: red, g: green, b: blue, a: alpha };
}

export function tryHexToRgba(hex: string): RGBA | null {
  try {
    return hexToRgba(hex);
  } catch {
    return null;
  }
}
