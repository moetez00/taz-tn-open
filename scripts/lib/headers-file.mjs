// Parser for Netlify's _headers format: an unindented path pattern followed by
// indented "Name: value" lines. `*` matches any run of characters.
export function parseHeadersFile(text) {
  const rules = [];
  let current = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: trimmed, headers: [] };
      rules.push(current);
      continue;
    }
    const colon = line.indexOf(":");
    if (!current || colon < 0) continue;
    current.headers.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
  }
  return rules.map((rule) => ({
    ...rule,
    re: new RegExp(
      "^" +
        rule.pattern
          .split("*")
          .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
          .join(".*") +
        "$",
    ),
  }));
}

// Headers that apply to a request path, merged across every matching rule.
export function headersFor(rules, pathname) {
  const merged = new Map();
  for (const rule of rules) {
    if (!rule.re.test(pathname)) continue;
    for (const [name, value] of rule.headers) {
      const key = name.toLowerCase();
      merged.set(key, merged.has(key) ? `${merged.get(key)}, ${value}` : value);
    }
  }
  return merged;
}
