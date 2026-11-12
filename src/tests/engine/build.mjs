// Bundles the real engines for node:test:  node src/tests/engine/build.mjs
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [path.join(here, "entry.js")], outfile: path.join(here, ".build/engine.mjs"),
  bundle: true, format: "esm", platform: "node", jsx: "automatic", loader: { ".js": "jsx" },
  define: { "import.meta.env": "{}", "process.env.NODE_ENV": '"test"', __CF_CHUNKS__: "{}" },
  inject: [path.join(here, "shim.js")], logLevel: "warning", sourcemap: false,
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
console.log("engine bundle ready");
