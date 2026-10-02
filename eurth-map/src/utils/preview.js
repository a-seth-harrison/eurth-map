// The feedback site: a second deployment that shows unreleased work under its own address
// (see "Feedback site" in CLAUDE.md). It is the same code built with VITE_PREVIEW set; the
// main site is built without it. On the feedback site a banner says so and links to the
// main map, and "Suggest an edit" is hidden (that deployment has no GitHub token).
export const IS_PREVIEW = !!import.meta.env.VITE_PREVIEW;
export const MAIN_URL = "https://eurth-map.vercel.app";

// index.css moves the fixed controls down by the banner's height under :root.preview
if (IS_PREVIEW) document.documentElement.classList.add("preview");
