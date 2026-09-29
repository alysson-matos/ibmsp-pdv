import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";
import { reportLovableError } from "@/lib/lovable-error-reporting";

const SESSION_EXPIRED = "Sessão expirada";

export function isSessionExpiredError(error: unknown) {
  return error instanceof Error && error.message.includes(SESSION_EXPIRED);
}

export function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const t = useT();
  const expired = isSessionExpiredError(error);

  useEffect(() => {
    if (expired) {
      const queryClient = router.options.context.queryClient;
      void queryClient.cancelQueries().finally(() => {
        queryClient.clear();
        void router.invalidate();
      });
      return;
    }

    console.error(error);
    reportLovableError(error, { boundary: "tanstack_route_error_component" });
  }, [error, expired, router]);

  if (expired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">{t("Esta página não carregou")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex justify-center">
          <Button
            onClick={() => {
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