interface ValidationResult {
  ok: boolean;
  error?: string;
}

const ALIAS_REFERENCE_PATTERN = /^\{([^}]+)\}$/;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isGradientKind(value: unknown): boolean {
  return value === "linear" || value === "radial" || value === "angular" || value === "diamond";
}

function validateGradientStop(stop: unknown, path: string): ValidationResult {
  if (!isObject(stop)) {
    return { ok: false, error: `Gradient stop at "${path}" must be object` };
  }

  if (typeof stop.position !== "number" || stop.position < 0 || stop.position > 100) {
    return { ok: false, error: `Gradient stop position at "${path}.position" must be number in 0..100` };
  }
  if (typeof stop.color !== "string") {
    return { ok: false, error: `Gradient stop color at "${path}.color" must be string` };
  }
  if (stop.opacity !== undefined && (typeof stop.opacity !== "number" || stop.opacity < 0 || stop.opacity > 1)) {
    return { ok: false, error: `Gradient stop opacity at "${path}.opacity" must be number in 0..1` };
  }

  const isAlias = ALIAS_REFERENCE_PATTERN.test(stop.color);
  if (isAlias && stop.opacity !== undefined) {
    return { ok: false, error: `Gradient alias stop at "${path}" cannot define opacity` };
  }
  if (!isAlias && !HEX_COLOR_PATTERN.test(stop.color)) {
    return { ok: false, error: `Gradient literal stop color at "${path}.color" must be valid hex` };
  }

  return { ok: true };
}

function isGradientObject(value: unknown, path: string): ValidationResult {
  if (!isObject(value)) return { ok: false, error: `Gradient value at "${path}" must be object` };
  if (!isGradientKind(value.kind)) {
    return { ok: false, error: `Gradient kind at "${path}.kind" is invalid` };
  }
  if (!Array.isArray(value.stops) || value.stops.length < 2) {
    return { ok: false, error: `Gradient stops at "${path}.stops" must be an array with at least 2 stops` };
  }
  if (value.angle !== undefined && typeof value.angle !== "number") {
    return { ok: false, error: `Gradient angle at "${path}.angle" must be number` };
  }
  if (value.opacity !== undefined) {
    return { ok: false, error: `Gradient value at "${path}" does not support "opacity"` };
  }

  for (let index = 0; index < value.stops.length; index += 1) {
    const stopResult = validateGradientStop(value.stops[index], `${path}.stops[${index}]`);
    if (!stopResult.ok) return stopResult;
  }

  return { ok: true };
}

function validateTokenValue(value: unknown, tokenType: string, path: string): ValidationResult {
  const validateLeafValue = (leafValue: unknown, leafPath: string): ValidationResult => {
    if (tokenType === "gradient") {
      return isGradientObject(leafValue, leafPath);
    }

    const gradientCheck = isGradientObject(leafValue, leafPath);
    if (gradientCheck.ok) {
      return { ok: false, error: `Only "$type: gradient" can use gradient objects at "${leafPath}"` };
    }

    if (!isPrimitive(leafValue)) {
      return { ok: false, error: `Token value at "${leafPath}" must be primitive` };
    }

    return { ok: true };
  };

  if (isPrimitive(value)) {
    if (tokenType === "gradient") {
      return { ok: false, error: `Gradient token at "${path}" cannot use primitive value` };
    }
    return { ok: true };
  }

  if (!isObject(value)) {
    return { ok: false, error: `Token value at "${path}" must be object, primitive, or mode map` };
  }

  const directGradientCheck = isGradientObject(value, path);
  if (directGradientCheck.ok) {
    if (tokenType !== "gradient") {
      return { ok: false, error: `Only "$type: gradient" can use gradient objects at "${path}"` };
    }
    return { ok: true };
  }

  for (const [modeName, modeValue] of Object.entries(value)) {
    const modeValidation = validateLeafValue(modeValue, `${path}.${modeName}`);
    if (!modeValidation.ok) return modeValidation;
  }
  return { ok: true };
}

function isTokenLeaf(node: unknown): boolean {
  if (!isObject(node)) return false;
  return typeof node.$type === "string" && "$value" in node;
}

function validateTokenTree(node: unknown, path: string[]): ValidationResult {
  if (isTokenLeaf(node)) {
    const typedNode = node as { $type: string; $value: unknown };
    return validateTokenValue(typedNode.$value, typedNode.$type, `${path.join(".")}.$value`);
  }
  if (Array.isArray(node)) {
    return { ok: false, error: `Token node at "${path.join(".") || "root"}" cannot be array` };
  }
  if (!isObject(node)) {
    return { ok: false, error: `Token node at "${path.join(".") || "root"}" must be object` };
  }

  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    const result = validateTokenTree(value, path.concat(key));
    if (!result.ok) return result;
  }

  return { ok: true };
}

export function validateTokenFile(value: unknown): ValidationResult {
  if (!isObject(value)) {
    return { ok: false, error: "Root must be object" };
  }

  const meta = value.meta;
  if (!isObject(meta)) {
    return { ok: false, error: '"meta" must be object' };
  }
  if (typeof meta.format !== "string" || typeof meta.version !== "string") {
    return { ok: false, error: '"meta.format" and "meta.version" must be strings' };
  }

  const collections = value.collections;
  if (!Array.isArray(collections) || collections.length === 0) {
    return { ok: false, error: '"collections" must be non-empty array' };
  }

  for (let index = 0; index < collections.length; index += 1) {
    const collection = collections[index];
    if (!isObject(collection)) {
      return { ok: false, error: `collections[${index}] must be object` };
    }
    if (typeof collection.name !== "string" || collection.name.length === 0) {
      return { ok: false, error: `collections[${index}].name must be non-empty string` };
    }
    if (!Array.isArray(collection.modes) || collection.modes.length === 0) {
      return { ok: false, error: `collections[${index}].modes must be non-empty array` };
    }
    for (let modeIndex = 0; modeIndex < collection.modes.length; modeIndex += 1) {
      const mode = collection.modes[modeIndex];
      if (typeof mode !== "string" || mode.length === 0) {
        return { ok: false, error: `collections[${index}].modes[${modeIndex}] must be string` };
      }
    }

    const tokens = collection.tokens;
    if (!isObject(tokens)) {
      return { ok: false, error: `collections[${index}].tokens must be object` };
    }
    const tokenValidation = validateTokenTree(tokens, ["collections[" + index + "]", "tokens"]);
    if (!tokenValidation.ok) return tokenValidation;
  }

  return { ok: true };
}
