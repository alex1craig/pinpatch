import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/components/*.tsx", "src/lib.ts", "src/lib/*.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  external: ["react", "react-dom"]
});
