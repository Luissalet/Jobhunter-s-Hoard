import { useState } from "react";
import { renderLetter } from "../letter-templates.js";
import Icon from "./Icon.jsx";

export default function LettersLibrary({ letters, onChange, notify }) {
  const [selectedId, setSelectedId] = useState(letters[0]?.id || ""),
    [puesto, setPuesto] = useState(""), [empresa, setEmpresa] = useState("");
  const selected = letters.find((letter) => letter.id === selectedId) || letters[0];
  const result = renderLetter(selected?.body || "", { puesto, empresa });
  const update = (key, value) => onChange(letters.map((letter) => letter.id === selected.id ? { ...letter, [key]: value } : letter));
  const add = () => {
    const id = crypto.randomUUID();
    onChange([...letters, { id, name: "Nueva carta", lang: "es", body: "" }]);
    setSelectedId(id);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(result.text); notify("Carta copiada. Lista para pegar en tu candidatura.", "info"); }
    catch { notify("No se pudo copiar. Selecciona el texto de la vista previa y cópialo manualmente."); }
  };
  return <section className="letters-library">
    <div className="editor-heading with-action"><div><h2>Cartas de presentación</h2><p>Guarda textos generales o crea una base reutilizable para cada candidatura.</p></div><button className="btn-ghost" onClick={add} disabled={letters.length >= 50}><Icon name="plus" />Nueva carta</button></div>
    {selected ? <>
      <label className="field"><span>Carta guardada</span><select value={selected.id} onChange={(e) => setSelectedId(e.target.value)}>{letters.map((letter) => <option key={letter.id} value={letter.id}>{letter.name || "Sin título"} · {letter.lang === "en" ? "Inglés" : "Español"}</option>)}</select></label>
      <div className="form-grid"><label className="field"><span>Nombre de la carta</span><input required maxLength="160" value={selected.name} onChange={(e) => update("name", e.target.value)} /></label><label className="field"><span>Idioma de la carta</span><select value={selected.lang} onChange={(e) => update("lang", e.target.value)}><option value="es">Español</option><option value="en">Inglés</option></select></label></div>
      <label className="field"><span>Texto base</span><textarea rows="12" maxLength="20000" value={selected.body} onChange={(e) => update("body", e.target.value)} placeholder="Pega una carta o escribe una plantilla con {{puesto}} y {{empresa}}." /><small>Usa {"{{puesto}}"} y {"{{empresa}}"} donde quieras sustituir esos datos. También puedes guardar una carta sin variables.</small></label>
      <div className="letter-personalization"><h3>Preparar para una candidatura</h3><p>Estos campos solo cambian la vista previa. El texto base se conserva.</p><div className="form-grid"><label className="field"><span>Puesto</span><input value={puesto} onChange={(e) => setPuesto(e.target.value)} placeholder="Por ejemplo: AI Engineer" /></label><label className="field"><span>Empresa</span><input value={empresa} onChange={(e) => setEmpresa(e.target.value)} placeholder="Nombre de la empresa" /></label></div>
      {result.missing.length > 0 && <p role="status" className="template-missing">Por completar: {result.missing.join(", ")}. Las variables admitidas son puesto y empresa.</p>}
      <label className="field"><span>Vista previa de la carta</span><textarea readOnly rows="12" value={result.text} /></label><div className="form-actions"><button className="btn-primary" disabled={!!result.missing.length || !result.text.trim()} onClick={copy}>Copiar carta preparada</button><button className="text-action muted" onClick={() => { onChange(letters.filter((letter) => letter.id !== selected.id)); setSelectedId(""); }}>Quitar carta</button></div></div>
    </> : <div className="section-empty"><Icon name="file" /><h3>Tu biblioteca de cartas</h3><p>Añade una carta que quieras reutilizar. Podrás editarla y personalizar el puesto y la empresa antes de copiarla.</p><button className="btn-primary" onClick={add}>Crear primera carta</button></div>}
  </section>;
}
