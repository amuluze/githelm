// @env node
import antfu from "@antfu/eslint-config";

export default antfu(
  {
    react: true,
    ignores: [
      "**/dist",
      "**/src-tauri/target",
      "**/src-tauri/gen",
      "**/tsconfig.tsbuildinfo",
    ],
    // The codebase predates this config and speaks double quotes + semicolons
    // (Vite template style); keep them instead of a whole-tree reformat.
    stylistic: {
      indent: 2,
      quotes: "double",
      semi: true,
    },
  },
);
