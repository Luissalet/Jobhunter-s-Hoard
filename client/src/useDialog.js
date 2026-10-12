import { useEffect, useRef } from "react";

// Opens the <dialog> beside the page instead of on top of it (show, not showModal): a modal dialog makes the rest of the
// document inert, which would leave the Faustus button and panel unreachable while a job or a form is open. The scrim that
// dims and blocks the page is drawn by the dialog's component; Escape asks to close, as a modal dialog would.
export function useOpenDialog(ref, onClose) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    ref.current?.show();
    const onKey = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ref]);
}