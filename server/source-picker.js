import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";

const run = promisify(execFile);
const script = fileURLToPath(new URL("./source-picker.ps1", import.meta.url));
let picking = false;

export async function pickSource(kind) {
  if (!["file", "folder"].includes(kind))
    throw new Error("Elige un archivo o una carpeta.");
  if (process.platform !== "win32")
    throw new Error("El selector de Windows no está disponible aquí. Puedes introducir la ruta manualmente.");
  if (picking)
    throw new Error("Ya hay un selector abierto. Termina la selección en Windows.");
  picking = true;
  try {
    const args = ["-NoLogo", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", script, "-Kind", kind];
    const options = { windowsHide: true, timeout: 300000, maxBuffer: 16384, encoding: "utf8" };
    let result;
    try {
      result = await run("pwsh.exe", args, options);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      result = await run("powershell.exe", args, options);
    }
    const selected = JSON.parse(result.stdout.replace(/^\uFEFF/, "").trim());
    if (!selected.path) return { cancelled: true };
    return { cancelled: false, path: selected.path, label: path.basename(selected.path) || selected.path };
  } catch (error) {
    if (error.killed) throw new Error("El selector se cerró por tiempo de espera. Vuelve a abrirlo para elegir una fuente.");
    throw new Error("No se pudo abrir el selector de Windows. Puedes introducir la ruta manualmente.");
  } finally {
    picking = false;
  }
}
