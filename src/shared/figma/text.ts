export type InterFontStyle = "Regular" | "Medium";

export function createTextNode(
  text: string,
  fontSize = 14,
  fontStyle: InterFontStyle = "Regular"
): TextNode {
  const node = figma.createText();
  node.fontName = { family: "Inter", style: fontStyle };
  node.fontSize = fontSize;
  node.characters = text;
  return node;
}
