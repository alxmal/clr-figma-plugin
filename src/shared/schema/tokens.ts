import { z } from "zod";

export type TokenPrimitive = string | number | boolean;
export type GradientKind = "linear" | "radial" | "angular" | "diamond";

export interface GradientStop {
  position: number;
  color: string;
  opacity?: number;
}

export interface GradientValue {
  kind: GradientKind;
  stops: GradientStop[];
  angle?: number;
  opacity?: number;
}

export type TokenLeafValue = TokenPrimitive | GradientValue;
export type TokenValue = TokenLeafValue | Record<string, TokenLeafValue>;

export interface TokenLeaf {
  $type: string;
  $description?: string;
  $extensions?: Record<string, unknown>;
  $value: TokenValue;
}

export interface TokenGroup {
  [key: string]: TokenLeaf | TokenGroup;
}

export type TokenNode = TokenLeaf | TokenGroup;

export const tokenPrimitiveSchema = z.union([z.string(), z.number(), z.boolean()]);

export const gradientStopSchema = z.object({
  position: z.number(),
  color: z.string(),
  opacity: z.number().optional()
});

export const gradientValueSchema = z.object({
  kind: z.enum(["linear", "radial", "angular", "diamond"]),
  stops: z.array(gradientStopSchema),
  angle: z.number().optional(),
  opacity: z.number().optional()
});

export const tokenValueSchema = z.union([
  tokenPrimitiveSchema,
  gradientValueSchema,
  z.record(z.string(), z.union([tokenPrimitiveSchema, gradientValueSchema]))
]);

export const tokenLeafSchema = z.object({
  $type: z.string(),
  $description: z.string().optional(),
  $extensions: z.record(z.string(), z.unknown()).optional(),
  $value: tokenValueSchema
});

const tokenNodeSchema: z.ZodType<TokenNode> = z.lazy(() =>
  z.union([tokenLeafSchema, z.record(z.string(), tokenNodeSchema)])
);

export const collectionSchema = z.object({
  name: z.string().min(1),
  modes: z.array(z.string().min(1)).min(1),
  tokens: z.record(z.string(), tokenNodeSchema)
});

export const clrTokenFileSchema = z.object({
  meta: z.object({
    format: z.string(),
    version: z.string(),
    source: z.string().optional()
  }),
  collections: z.array(collectionSchema).min(1)
});

export type ClrTokenFile = z.infer<typeof clrTokenFileSchema>;
