// Lets `node --test` load TypeScript sources that import siblings without an
// extension (as bundlers allow), e.g. `import { x } from "./settings"`.
import { register } from "node:module";

register("./ts-resolver.mjs", import.meta.url);
