import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type GateRole = "admin" | "user";

export const getRole = createServerFn({ method: "GET" }).handler(async (): Promise<GateRole | null> => {
  const { currentRole } = await import("./gate.server");
  return currentRole();
});

export const unlock = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ password: z.string().min(1) }).parse(data))
  .handler(async ({ data }): Promise<{ ok: boolean; role: GateRole | null }> => {
    const { resolveRole, getGateSession } = await import("./gate.server");
    const role = resolveRole(data.password);
    if (!role) return { ok: false, role: null };
    const session = await getGateSession();
    await session.update({ role });
    return { ok: true, role };
  });

export const lock = createServerFn({ method: "POST" }).handler(async () => {
  const { getGateSession } = await import("./gate.server");
  const session = await getGateSession();
  await session.clear();
  return { ok: true };
});
