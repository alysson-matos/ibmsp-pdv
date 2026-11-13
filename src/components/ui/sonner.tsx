import { Toaster as Sonner } from "sonner";

import { useTheme } from "@/hooks/use-theme";
import { useRetro } from "@/lib/retro";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme();
  // Retro look: ink box with a yellow (or red, on error) frame (.ztoast in styles.css).
  if (useRetro()) {
    return (
      <Sonner
        theme="light"
        className="toaster group"
        toastOptions={{ unstyled: true, classNames: { toast: "ztoast" } }}
        {...props}
      />
    );
  }
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
