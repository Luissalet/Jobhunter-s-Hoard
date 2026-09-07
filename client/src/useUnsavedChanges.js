import { useEffect } from "react";

export function confirmDiscard(dirty) {
  return (
    !dirty ||
    window.confirm("Hay cambios sin guardar. ¿Quieres descartarlos y salir?")
  );
}

export function useUnsavedChanges(dirty) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
