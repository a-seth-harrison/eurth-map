import nations from "./nations";

// International organizations shown as overlays: every member lights up in the
// organization's colour without hovering (see "International organizations" in CLAUDE.md).
// `name` is the switch's label: always the full name, with the acronym in parentheses after
// it when the organization goes by one. `members` are nations.js keys. A member without a traced shape yet (database-only) is
// listed all the same: it lights up once it is given territory. Toggle ids share the
// `overlays` state in App.jsx.
export const ORGANIZATIONS = [
  {
    id: "aurelian-league",
    name: "Aurelian League (AL)",
    color: "#f6aa27",
    // Cruciastada was a member until 2026-10-03, when it was expelled
    members: ["Esonice", "Ionio", "Kirvina", "Mikochi", "Mito", "Rhodellia"],
  },
  {
    id: "oriental-states",
    name: "Oriental States (OS)",
    color: "#2A57DF",
    // Cristina and Niederoestereich have no territory on the map yet
    members: [
      "Bainbridge-Islands",
      "Cristina",
      "Deltannia",
      "Ide-Jima",
      "Mekabiri",
      "Miiros",
      "Niederoestereich",
      "Orioni",
      "Sunseong",
      "Tamurin",
      "Tavok",
    ],
  },
  {
    id: "atlas",
    name: "Adlantic Treaty for Leadership and Allied Sovereignty (ATLAS)",
    color: "#ffffff", // placeholder colour
    members: ["Pentium", "Poja", "Tagmatium"],
  },
  {
    id: "argic-economic-community",
    name: "Argic Economic Community (AEC)",
    color: "#599A47",
    // Pentium is in ATLAS too: with both on it is striped (see memberColors)
    members: ["Charkov", "Coedana", "Eemsmerschen", "Garindina", "Pentium", "Welkija"],
  },
  {
    id: "west-argic-security-pact",
    name: "West Argic Security Pact (WASP)",
    color: "#8E44AD", // placeholder colour
    // Charkov and Garindina are in the Argic Economic Community too
    members: ["Charkov", "Erisoria", "Garindina"],
  },
  {
    id: "third-transnational",
    name: "The Third Transnational (TTT)",
    color: "#B21114",
    // Haitu is a member too, but is not in nations.js yet: add it here once it exists.
    // Charkov is in three organizations, the most of any nation so far
    members: [
      "Charkov",
      "Cruciastada",
      "Eemsmerschen",
      "Florentia",
      "Kiziauke",
      "Stedoria",
      "Suminto",
      "Verraine",
      "Welkija",
    ],
  },
  {
    id: "aemec",
    name: "Alharun Eastern Maritime and Economic Community (AEMEC)",
    color: "#00D5E0", // was #347896, too close to TRIDENT; a cyan that still stands off the sea
    // Suminto is in the Third Transnational too
    members: ["Denawar", "Flaca-Vul", "Suminto"],
  },
  {
    id: "trident",
    name: "Tricontinental Defence Treaty Organisation (TRIDENT)",
    color: "#005292", // its official colour
    // "Greater Galicia" and "Sanctum Imperium Catholicum" in the membership list are
    // Galicia and Salvia. Poja is in ATLAS too
    members: [
      "Andalla",
      "Duchy-of-Verde",
      "Galicia",
      "Gallambria",
      "Girkmand",
      "Iverica",
      "Narva",
      "Poja",
      "Prymont",
      "Salvia",
      "Variota",
      "Vasqqa",
    ],
  },
];

if (import.meta.env.DEV) {
  for (const org of ORGANIZATIONS) {
    for (const key of org.members) {
      if (!nations[key]) console.warn(`${org.name}: member "${key}" is not in nations.js`);
    }
  }
}

// A nation in two or more enabled organizations is filled with diagonal stripes of their
// colours. One full set of stripes spans this many degrees of (longitude - latitude), in
// both views. It must divide 360, or the globe shows a seam at 90 degrees west.
export const STRIPE_PERIOD_DEG = 4;

// { nationKey: [colour, ...] } for the enabled organizations, in the order they are listed.
// One colour = a plain fill, more = stripes.
export function memberColors(enabled) {
  const colors = {};
  for (const org of ORGANIZATIONS) {
    if (!enabled[org.id]) continue;
    for (const key of org.members) {
      const list = (colors[key] ??= []);
      if (!list.includes(org.color)) list.push(org.color);
    }
  }
  return colors;
}
