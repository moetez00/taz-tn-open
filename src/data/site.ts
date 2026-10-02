export const site = {
  handle: "Taz",
  name: "Moetez Zouari",
  oneLiner:
    "Taz ships web apps to real users and writes exploitation challenges for CTF players.",
  email: "moetaz.zouari@insat.ucar.tn",
  // The OVH alias behind /security and security.txt (PLAN.md §10, M0).
  securityEmail: "security@taz.tn",
  links: {
    github: "https://github.com/moetez00",
    linkedin: "https://linkedin.com/in/moetezzouari",
  },
  // Nav order is also the order pages slide in (boot.js) and the 1-4 keys (keys.ts).
  nav: [
    { id: "home", label: "Home", href: "/" },
    { id: "projects", label: "Projects", href: "/projects/" },
    { id: "journal", label: "Journal", href: "/journal/" },
    { id: "about", label: "About", href: "/about/" },
  ],
  // The hero (index.astro). Edit freely: nothing else depends on these words.
  hero: {
    // The one-liner without the name, which the hero sets large above it.
    line: ["ships web apps to real users", "and writes exploitation challenges", "for CTF players."],
    tags: [
      { label: "binary", glyph: "binary", href: "/journal/" },
      { label: "web", glyph: "web", href: "/projects/" },
      { label: "research", glyph: "research", href: "/journal/" },
    ],
    // Brightness of the dot: 2 now, 1 often, 0 on the list.
    exploring: [
      { label: "web apps", level: 2 },
      { label: "pwn / CTF", level: 2 },
      { label: "linux", level: 1 },
      { label: "learning", level: 0 },
    ],
    quote: ["The path is long,", "but the bugs are shorter."],
    // Decorative: a memory map in the hero's corner. Fill runs 1 to 5.
    memory: [
      { label: "stack", fill: 4 },
      { label: "heap", fill: 2 },
      { label: "libc", fill: 3 },
      { label: ".text", fill: 1 },
    ],
    address: "0x7fffffffe2a0",
  },
  projectsLine: "Real projects. Real users. Real problems.",
  projectsQuote: "Build, break, learn, repeat.",
} as const;

export type Section = (typeof site.nav)[number]["id"];
