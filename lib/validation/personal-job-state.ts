import { z } from "zod";

export const personalApplicationStatusSchema = z.enum([
  "unreviewed",
  "planned",
  "applied",
  "interviewing",
  "offered",
  "rejected",
  "withdrawn",
]);

const nextActionAtSchema = z.string().datetime({ offset: false }).nullable();

export const personalJobStateInputSchema = z.strictObject({
  canonicalJobId: z.string().uuid(),
  saved: z.boolean(),
  excluded: z.boolean(),
  applicationStatus: personalApplicationStatusSchema,
  memo: z.string().max(10_000),
  nextActionAt: nextActionAtSchema,
});

export const personalJobToggleSchema = z.strictObject({
  canonicalJobId: z.string().uuid(),
  value: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export const personalJobTrackingSchema = z.strictObject({
  canonicalJobId: z.string().uuid(),
  applicationStatus: personalApplicationStatusSchema,
  memo: z.string().max(10_000),
  nextActionAt: z.union([z.literal("").transform(() => null), nextActionAtSchema]),
});

export type PersonalApplicationStatus = z.infer<typeof personalApplicationStatusSchema>;
