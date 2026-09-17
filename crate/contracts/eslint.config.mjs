import globals from "globals";

/**
 * One rule matters here, and it is the reason this file exists.
 *
 * A patch to pack.mjs once failed to apply and left the script asking for
 * FLOOR_ETH in one place while reading an undefined `floorEth` in another. It
 * parsed. `node --check` passed. Starting it with nothing set passed, because
 * it exited before reaching the broken line. The first thing that noticed was
 * the launch, after the irreversible step had already run.
 *
 * `no-undef` sees it without running anything.
 */
export default [
  {
    files: ["**/*.mjs"],
    ignores: ["node_modules/**", "out/**"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];
