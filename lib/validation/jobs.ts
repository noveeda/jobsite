import { z } from "zod";

export const valueOriginSchema = z.enum(["source", "normalized", "user", "missing", "not_applicable", "failed"]);
export const deadlineKindSchema = z.enum(["fixed", "rolling", "until_hired", "unknown"]);
export const applicationStatusSchema = z.enum(["unreviewed", "interested", "planned", "applied", "interviewing", "accepted", "rejected", "excluded"]);
export const sourceUrlSchema = z.url().max(2048).refine((value) => new URL(value).protocol === "https:", "HTTPS URL만 등록할 수 있습니다.");

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const stringList = (max: number) => z.array(z.string().trim().min(1).max(max)).max(100).default([]);

export const jobInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  companyName: z.string().trim().min(1).max(200),
  originalUrl: sourceUrlSchema,
  roleName: optionalText(200),
  summary: optionalText(1000),
  responsibilities: stringList(500),
  qualifications: stringList(500),
  preferredQualifications: stringList(500),
  careerMinYears: z.number().int().min(0).max(80).optional().nullable(),
  careerMaxYears: z.number().int().min(0).max(80).optional().nullable(),
  educationText: optionalText(100),
  employmentTypes: stringList(100),
  locations: stringList(200),
  salaryText: optionalText(200),
  skills: stringList(100),
  postedAt: z.iso.datetime().optional().nullable(),
  deadlineAt: z.iso.datetime().optional().nullable(),
  deadlineKind: deadlineKindSchema,
  memo: z.string().max(20000).default(""),
  nextActionAt: z.iso.datetime().optional().nullable(),
}).superRefine((value, context) => {
  if (value.deadlineKind === "fixed" && !value.deadlineAt) {
    context.addIssue({ code: "custom", path: ["deadlineAt"], message: "마감일을 입력해 주세요." });
  }
  if (value.careerMinYears != null && value.careerMaxYears != null && value.careerMaxYears < value.careerMinYears) {
    context.addIssue({ code: "custom", path: ["careerMaxYears"], message: "최대 경력은 최소 경력보다 작을 수 없습니다." });
  }
});

export type JobInput = z.infer<typeof jobInputSchema>;
