import { z } from "zod";

export type TokenPrimitive = string | number | boolean;
export type TokenValue = TokenPrimitive | Record<string, TokenPrimitive>;

export interface TokenLeaf {
  $type: string;
  $description?: string;
  $value: TokenValue;
}

export interface TokenGroup {
  [key: string]: TokenLeaf | TokenGroup;
}

export type TokenNode = TokenLeaf | TokenGroup;

export const tokenPrimitiveSchema = z.union([z.string(), z.number(), z.boolean()]);

export const tokenValueSchema = z.union([
  tokenPrimitiveSchema,
  z.record(z.string(), tokenPrimitiveSchema)
]);

export const tokenLeafSchema = z.object({
  $type: z.string(),
  $description: z.string().optional(),
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
