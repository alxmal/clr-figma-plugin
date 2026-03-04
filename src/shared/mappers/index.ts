export function toFigmaVariableName(tokenPath: string): string {
  return tokenPath.split(".").join("/");
}

export function toJsonTokenPath(variableName: string): string {
  return variableName.split("/").join(".");
}
