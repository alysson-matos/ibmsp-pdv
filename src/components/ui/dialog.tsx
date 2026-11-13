"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { useRetro } from "@/lib/retro";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  const retro = useRetro();
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        retro ? "overlay" : "fixed inset-0 z-50 bg-black/80",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  );
});
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

// In the retro look it's a Windows 95-style window: the frame is beveled,
// DialogHeader/DialogTitle become the gradient title bar and everything else sits on
// the paper body. `ok` (retro only) paints the title bar green.
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { ok?: boolean }
>(({ className, children, ok, ...props }, ref) => {
  const retro = useRetro();
  if (retro) {
    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            "dlg bevel fixed left-[50%] top-[50%] z-50 w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            ok && "ok",
            className,
          )}
          {...props}
        >
          <div className="dlg-body">{children}</div>
          <DialogPrimitive.Close className="bevel dlg-close dlg-x">
            <span aria-hidden="true">×</span>
            <span className="sr-only">Fechar</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  }
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const retro = useRetro();
  return (
    <div
      className={cn(
        retro ? "dlg-head" : "flex flex-col space-y-1.5 text-center sm:text-left",
        className,
      )}
      {...props}
    />
  );
};
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const retro = useRetro();
  return (
    <div
      className={cn(
        retro ? "dlg-actions" : "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
        className,
      )}
      {...props}
    />
  );
};
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => {
  const retro = useRetro();
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        retro ? "titlebar" : "text-lg font-semibold leading-none tracking-tight",
        className,
      )}
      {...props}
    />
  );
});
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  const retro = useRetro();
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn(retro ? "dlg-desc" : "text-sm text-muted-foreground", className)}
      {...props}
    />
  );
});
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
