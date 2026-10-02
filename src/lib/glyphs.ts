// The site's glyphs, drawn for it: line icons on a 24 x 24 grid, stroked by CSS
// (.hex .glyph in world.css). Markup only; they hold no text and no style.
export const GLYPHS = {
  binary:
    '<ellipse cx="8" cy="7.6" rx="2.9" ry="3.8"/><path d="M16.5 3.8v7.6m-2.2-5.8 2.2-1.8"/><path d="M6.5 14.8v6.4m-2.1-4.6 2.1-1.8"/><ellipse cx="16" cy="18" rx="2.9" ry="3.4"/>',
  web: '<circle cx="12" cy="12" r="8.2"/><ellipse cx="12" cy="12" rx="3.6" ry="8.2"/><path d="M4.4 9h15.2M4.4 15h15.2"/>',
  research: '<path d="M12 2.8 21.2 12 12 21.2 2.8 12Z"/><circle cx="12" cy="12" r="2.6"/><path d="M12 6.2v1.6m0 8.4v1.6M6.2 12h1.6m8.4 0h1.6"/>',
  scroll: '<rect x="7.6" y="3" width="8.8" height="18" rx="4.4"/><path d="M12 7.6v3.2"/>',
  pulse: '<path d="M2.8 12.6h4.2l2.2-6.2 3.4 11.6 2.6-8 1.4 2.6h4.6"/><circle cx="12" cy="12" r="9.2" opacity=".35"/>',
  resume: '<path d="M6.5 2.8h7.6l4.4 4.4v14H6.5Z"/><path d="M14 2.8v4.6h4.5M9.4 12.2h5.6M9.4 15.6h5.6M9.4 8.8h2.4"/>',
  pharmacy: '<path d="M9.4 3.8h5.2v5.6h5.6v5.2h-5.6v5.6H9.4v-5.6H3.8V9.4h5.6Z"/>',
  ardoise:
    '<path d="M4.6 4.6h5.2v5.2H4.6ZM14.2 4.6h5.2v5.2h-5.2ZM4.6 14.2h5.2v5.2H4.6Z"/><path d="M14.2 14.2h2.4v2.4h-2.4ZM18.2 18.2h1.2M14.2 18.6v.8"/>',
  repair:
    '<path d="M14.6 3.8a4.2 4.2 0 0 0-4.9 5.5L3.8 15.2 8.8 20.2l5.9-5.9a4.2 4.2 0 0 0 5.5-4.9l-2.9 2.9-2.7-.6-.6-2.7Z"/>',
  api: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="8" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="m7.9 6.3 8.2 1.4M6.5 8l1 8m3.5 2h5m1-8v6"/>',
  mask: '<path d="M7.8 9.4C6.2 7.2 4.6 4.8 4.2 2.4c1.9 2.2 3.5 4.2 5.2 6ZM16.2 9.4c1.6-2.2 3.2-4.6 3.6-7-1.9 2.2-3.5 4.2-5.2 6Z"/><path d="M12 8.6c3.9 0 6.2 2.9 6.2 6.8 0 4.7-2.8 7.8-6.2 7.8s-6.2-3.1-6.2-7.8c0-3.9 2.3-6.8 6.2-6.8Z"/><path d="M9.4 14.4c.9 0 1.3 1.4 1.3 3s-.6 2.9-1.3 2.9-1.3-1.3-1.3-2.9.4-3 1.3-3Zm5.2 0c.9 0 1.3 1.4 1.3 3s-.6 2.9-1.3 2.9-1.3-1.3-1.3-2.9.4-3 1.3-3Z"/>',
} as const;

export type GlyphName = keyof typeof GLYPHS;

// A project's glyph, by its id; anything new falls back to the diamond.
const PROJECT: Record<string, GlyphName> = {
  "insat-pulse": "pulse",
  resumehub: "resume",
  mypharma: "pharmacy",
  ardoise: "ardoise",
  "talifouni-plus": "repair",
  "fastapi-inventory": "api",
};

export const projectGlyph = (id: string): GlyphName => PROJECT[id] ?? "research";
