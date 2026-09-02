import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

export type GateRole = "admin" | "user";
export type GateSession = { role?: GateRole };

function sessionConfig() {
  return {
    password: process.env["SESSION_SECRET"]!,
    name: "pdv-gate",
    maxAge: 60 * 60 * 12,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" },
  };
}

export function getGateSession() {
  return useSession<GateSession>(sessionConfig());
}

function matches(input: string, expected: string | undefined) {
  if (!expected) return false;
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export function resolveRole(password: string): GateRole | null {
  if (matches(password, process.env["ADMIN_PASSWORD"])) return "admin";
  if (matches(password, process.env["USER_PASSWORD"])) return "user";
  return null;
}

export async function currentRole(): Promise<GateRole | null> {
  const session = await getGateSession();
  return session.data.role ?? null;
}

/** Throws when the caller is not allowed. `scope: "admin"` = admin only. */
export async function requireRole(scope: "admin" | "any" = "admin"): Promise<GateRole> {
  const role = await currentRole();
  if (!role) throw new Error("Sessão expirada. Digite a senha novamente.");
  if (scope === "admin" && role !== "admin") {
    throw new Error("Acesso restrito ao administrador.");
  }
  return role;
}
