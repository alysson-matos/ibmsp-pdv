import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { redirect } from "@tanstack/react-router";

export type GateRole = "admin" | "user";
export type GateSession = { role?: GateRole };

function sessionConfig() {
  return {
    password: process.env["SESSION_SECRET"]!,
    name: "pdv-gate",
    maxAge: 60 * 60 * 12,
    cookie: {
      httpOnly: true,
      // The app can run inside a cross-site iframe (preview), where only
      // SameSite=None; Secure cookies are sent back.
      secure: true,
      sameSite: "none" as const,
      path: "/",
    },
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

/** Redirects expired callers through router control flow. `scope: "admin"` = admin only. */
export async function requireRole(scope: "admin" | "any" = "admin"): Promise<GateRole> {
  const role = await currentRole();
  if (!role) throw redirect({ to: "/", reloadDocument: true });
  if (scope === "admin" && role !== "admin") {
    throw new Error("Acesso restrito ao administrador.");
  }
  return role;
}
