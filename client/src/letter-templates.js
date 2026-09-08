export function renderLetter(template, values) {
  const missing = new Set();
  const text = template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (token, name) => {
    const key = name.trim().toLowerCase();
    const value = ["puesto", "empresa"].includes(key) ? values[key]?.trim() : "";
    if (!value) { missing.add(key); return token; }
    return value;
  });
  return { text, missing: [...missing] };
}
