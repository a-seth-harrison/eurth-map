import { MAIN_URL } from "../utils/preview";

// Strip across the top of the feedback site (App.jsx renders it only when IS_PREVIEW).
// The whole strip is the link, so it is easy to hit with a finger.
export default function PreviewBanner() {
  return (
    <a className="preview-banner" href={MAIN_URL}>
      Preview: international organizations · <span>Main map →</span>
    </a>
  );
}
