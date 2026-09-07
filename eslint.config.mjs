import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import path from "node:path";

const compat = new FlatCompat({ baseDirectory: path.dirname(fileURLToPath(import.meta.url)) });
const config = [
  { ignores: [".next/**", ".next-test/**", "node_modules/**", "public/tesseract/**", "next-env.d.ts", "test-results/**", "playwright-report/**"] },
  ...compat.extends("next/core-web-vitals"),
];
export default config;
