import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import vm from "node:vm";
import { buildSync } from "esbuild";

test("shipped reader retains a valid fragment on retry, follows native history and rejects a closed or changed file response", async () => {
  const code = buildSync({ entryPoints: [path.resolve("client/src/components/SourceReader.jsx")], bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", external: ["react", "react/jsx-runtime"] }).outputFiles[0].text;
  let cursor = 0, tree, pendingEffects = [], slots = [], requests = [];
  const hooks = {
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value }; },
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], next => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }]; },
    useEffect(run, deps) { const i = cursor++; if (!slots[i] || deps.some((d, n) => d !== slots[i].deps[n])) { pendingEffects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: run() }; }); } },
  };
  const jsx = (type, props) => ({ type, props }); const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, URLSearchParams, require: name => name === "react" ? hooks : { jsx, jsxs: jsx }, fetch: url => new Promise(resolve => requests.push({ url, resolve })) });
  const Component = module.exports.default;
  let props = { contextId: "ctx", contextName: "Ficticio", source: { id: "source", kind: "file", label: "Own text" }, onClose() {} };
  const render = () => { cursor = 0; pendingEffects = []; tree = Component(props); pendingEffects.forEach(fn => fn()); return tree; };
  const all = node => node && typeof node === "object" ? [node, ...[node.props?.children].flat(Infinity).flatMap(all)] : [];
  const text = node => typeof node === "string" || typeof node === "number" ? String(node) : node && typeof node === "object" ? [node.props?.children].flat(Infinity).map(text).join("") : "";
  const button = label => all(tree).find(n => n.type === "button" && text(n) === label);
  const respond = async (index, value, ok = true) => { requests[index].resolve({ ok, status: ok ? 200 : 503, json: async () => value }); await new Promise(setImmediate); render(); };
  const page = (offset, content, nextOffset) => ({ offset, content, nextOffset, totalChars: 25000, modifiedAt: "2026-10-24T09:00:00Z", file: "own.txt" });
  const unmount = () => slots.forEach(slot => slot?.cleanup?.());
  render(); await respond(0, page(0, "Primero ñ 😀", 12000)); button("Siguiente fragmento").props.onClick(); render();
  assert.match(requests[1].url, /offset=12000/); await respond(1, { error: "Fallo ficticio" }, false);
  assert.match(text(tree), /Primero ñ 😀/); assert.match(text(tree), /Se conserva el fragmento anterior/);
  button("Reintentar lectura").props.onClick(); assert.equal(requests[2].url, requests[1].url);
  await respond(2, page(12000, "Segundo ñ", 24000)); button("Anterior").props.onClick(); assert.match(requests[3].url, /offset=0/);
  await respond(3, page(0, "Primero otra vez", 12000)); button("Siguiente fragmento").props.onClick(); unmount();
  const prior = JSON.stringify(slots); await respond(4, page(12000, "No reabrir", 24000)); assert.equal(JSON.stringify(slots), prior);
  slots = []; requests = []; props = { ...props, source: { id: "folder", kind: "folder", label: "Own folder" } };
  render(); await respond(0, { files: ["a.txt", "b.txt"], truncated: false, errors: [] }); button("a.txt").props.onClick(); render();
  button("Volver a los archivos").props.onClick(); render(); button("b.txt").props.onClick(); render();
  await respond(1, page(0, "Respuesta antigua A", null)); assert.doesNotMatch(text(tree), /Respuesta antigua A/);
  await respond(2, page(0, "Documento B", null)); assert.match(text(tree), /Documento B/); assert.equal(button("Siguiente fragmento").props.disabled, true); unmount();
});
