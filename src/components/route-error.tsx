import { useEffect, useState } from "react";
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { restartApp } from "@/lib/restart-app";
import { useRetro } from "@/lib/retro";
import { cn } from "@/lib/utils";

const SESSION_EXPIRED = "Sessão expirada";

export function isSessionExpiredError(error: unknown) {
  return error instanceof Error && error.message.includes(SESSION_EXPIRED);
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  const t = useT();
  // A restart refused by the loop guard falls through to the normal error screen.
  const [restartSkipped, setRestartSkipped] = useState(false);
  const expired = isSessionExpiredError(error) && !restartSkipped;
  // In the retro look it renders inside the store window, not as a full page.
  const page = useRetro() ? "min-h-[50vh]" : "min-h-screen bg-background";

  useEffect(() => {
    if (expired) {
      if (!restartApp()) setRestartSkipped(true);
      return;
    }

    console.error(error);
    reportLovableError(error, { boundary: "tanstack_route_error_component" });
  }, [error, expired, router]);

  if (expired) {
    return (
      <div className={cn("flex items-center justify-center", page)}>
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-center px-4", page)}>
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">{t("Esta página não carregou")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <div className="mt-6 flex justify-center">
          <Button
            onClick={() => {
              if (isSessionExpiredError(error)) {
                restartApp({ force: true });
                return;
              }
              void router.invalidate();
              reset();
            }}
          >
            {t("Tentar novamente")}
          </Button>
        </div>
      </div>
    </div>
  );
}
