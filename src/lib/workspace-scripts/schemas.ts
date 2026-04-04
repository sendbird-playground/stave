import { z } from "zod";

export const AutomationTargetSchema = z.object({
  label: z.string().optional(),
  cwd: z.enum(["workspace", "project"]).optional(),
  env: z.record(z.string(), z.string()).optional(),
  shell: z.string().optional(),
});

export const AutomationOrbitSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().optional(),
  noTls: z.boolean().optional(),
  proxyPort: z.number().int().positive().optional(),
});

export const AutomationActionSchema = z.object({
  label: z.string().optional(),
  description: z.string().optional(),
  commands: z.array(z.string()).default([]),
  target: z.string().optional(),
  timeoutMs: z.number().int().positive().optional(),
  enabled: z.boolean().optional(),
});

export const AutomationServiceSchema = AutomationActionSchema.extend({
  restartOnRun: z.boolean().optional(),
  orbit: AutomationOrbitSchema.optional(),
});

export const AutomationHookRefSchema = z.union([
  z.string(),
  z.object({
    ref: z.string(),
    kind: z.enum(["action", "service"]).optional(),
    blocking: z.boolean().optional(),
  }),
]);

export const AutomationHooksSchema = z.object({
  "workspace.created": z.array(AutomationHookRefSchema).optional(),
  "workspace.archiving": z.array(AutomationHookRefSchema).optional(),
  "pr.beforeOpen": z.array(AutomationHookRefSchema).optional(),
  "pr.afterOpen": z.array(AutomationHookRefSchema).optional(),
});

export const AutomationsConfigSchema = z.object({
  version: z.literal(2),
  actions: z.record(z.string(), AutomationActionSchema).optional(),
  services: z.record(z.string(), AutomationServiceSchema).optional(),
  hooks: AutomationHooksSchema.optional(),
  targets: z.record(z.string(), AutomationTargetSchema).optional(),
});

export const AutomationsLocalConfigSchema = z.object({
  version: z.literal(2),
  actions: z.record(z.string(), AutomationActionSchema.partial()).optional(),
  services: z.record(z.string(), AutomationServiceSchema.partial()).optional(),
  hooks: AutomationHooksSchema.optional(),
  targets: z.record(z.string(), AutomationTargetSchema.partial()).optional(),
});
