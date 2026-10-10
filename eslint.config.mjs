import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
export default [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "work/**",
      "outputs/**",
      "next-env.d.ts",
      "tests/e2e.cjs",
    ],
  },
];
