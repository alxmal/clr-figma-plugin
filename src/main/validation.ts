interface ValidationResult {
  ok: boolean;
  error?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrimitive(value: unknown): boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isTokenLeaf(node: unknown): boolean {
  if (!isObject(node)) return false;
  if (typeof node.$type !== "string") return false;
  if (!("$value" in node)) return false;

  const tokenValue = node.$value;
  if (isPrimitive(tokenValue)) return true;
  if (!isObject(tokenValue)) return false;

  for (const value of Object.values(tokenValue)) {
    if (!isPrimitive(value)) return false;
  }
  return true;
}

function validateTokenTree(node: unknown, path: string[]): ValidationResult {
  if (isTokenLeaf(node)) {
    return { ok: true };
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
