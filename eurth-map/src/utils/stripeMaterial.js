import { Color, DoubleSide, MeshBasicMaterial } from "three";
import { STRIPE_PERIOD_DEG } from "../data/organizations";

// Globe fill for a nation in two or more enabled organizations: diagonal stripes in their
// colours, the same stripes the flat map draws with a gradient (MapViewer.jsx). The stripe
// is computed from the fragment's own longitude and latitude, so it needs no texture and no
// UVs. Imported by GlobeViewer.jsx only: it pulls in three.js.
const cache = new Map();

export function stripeMaterial(colors, opacity) {
  const key = `${colors.join()}@${opacity}`;
  let material = cache.get(key);
  if (material) return material;

  const n = colors.length;
  const stripeColors = colors.map((c) => new Color(c));
  // Same settings as three-globe's own cap material, so stripes sort and blend like the rest
  material = new MeshBasicMaterial({ side: DoubleSide, depthWrite: true, transparent: true, opacity });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.stripeColors = { value: stripeColors };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vStripePos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvStripePos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying vec3 vStripePos;\nuniform vec3 stripeColors[${n}];`
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `// three-globe: x = sin(phi) cos(theta), y = cos(phi), z = sin(phi) sin(theta), theta = 90 - lng
        vec3 stripeDir = normalize( vStripePos );
        float stripeLat = degrees( asin( clamp( stripeDir.y, -1.0, 1.0 ) ) );
        float stripeLng = 90.0 - degrees( atan( stripeDir.z, stripeDir.x ) );
        // + 0.5 puts the stripes where the flat map has them. The period divides 360, so the
        // jump in atan() falls on a stripe boundary
        float stripeT = fract( ( stripeLng - stripeLat ) / ${STRIPE_PERIOD_DEG.toFixed(4)} + 0.5 );
        int stripeIndex = int( min( floor( stripeT * ${n}.0 ), ${n - 1}.0 ) );
        vec4 diffuseColor = vec4( stripeColors[ stripeIndex ], opacity );`
      );
  };
  material.customProgramCacheKey = () => `org-stripes-${n}-${STRIPE_PERIOD_DEG}`;
  cache.set(key, material);
  return material;
}

export function disposeStripeMaterials() {
  for (const material of cache.values()) material.dispose();
  cache.clear();
}
