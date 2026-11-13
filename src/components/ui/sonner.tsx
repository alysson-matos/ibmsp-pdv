import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/** Toasts in the register look: ink box with a yellow (or red, on error) frame. */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{ unstyled: true, classNames: { toast: "ztoast" } }}
      {...props}
    />
  );
};

export { Toaster };
