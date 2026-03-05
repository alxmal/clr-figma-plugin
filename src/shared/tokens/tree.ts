import type { TokenLeaf, TokenNode } from "../schema/tokens";

export interface TokenLeafVisitContext {
  leaf: TokenLeaf;
  pathParts: string[];
  tokenPath: string;
}

export function isTokenLeaf(node: TokenNode | unknown): node is TokenLeaf {
  if (typeof node !== "object" || node === null || Array.isArray(node)) return false;
  const candidate = node as Partial<TokenLeaf>;
  return typeof candidate.$type === "string" && candidate.$value !== undefined;
}

export function walkTokenTree(
  node: TokenNode,
  visitor: (context: TokenLeafVisitContext) => void,
  pathParts: string[] = []
): void {
  if (isTokenLeaf(node)) {
    const tokenPath = pathParts.join(".");
    if (!tokenPath) return;
    visitor({ leaf: node, pathParts, tokenPath });
    return;
  }

  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    walkTokenTree(child as TokenNode, visitor, pathParts.concat(key));
  }
}

export function setTokenAtPath(root: Record<string, unknown>, tokenPath: string, leaf: TokenLeaf): void {
  const pathParts = tokenPath.split(".");
  if (pathParts.length === 0) return;

  let current: Record<string, unknown> = root;
  for (let index = 0; index < pathParts.length; index += 1) {
    const part = pathParts[index];
    const isLast = index === pathParts.length - 1;
    const existing = current[part];

    if (isLast) {
      if (existing && typeof existing === "object" && !Array.isArray(existing) && !isTokenLeaf(existing)) {
        throw new Error(`Cannot set token "${tokenPath}": a group already exists at this path`);
      }
      current[part] = leaf;
      return;
    }

    if (!existing) {
      current[part] = {};
      current = current[part] as Record<string, unknown>;
      continue;
    }

    if (typeof existing === "object" && existing !== null && !Array.isArray(existing) && !isTokenLeaf(existing)) {
      current = existing as Record<string, unknown>;
      continue;
    }

    throw new Error(`Cannot set token "${tokenPath}": token leaf conflicts with group path`);
  }
}
