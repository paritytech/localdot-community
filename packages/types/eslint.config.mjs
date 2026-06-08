import { getConfiguration } from "@localdot/config/eslint";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default [
  {
    ignores: ["**/node_modules/**", "**/dist/**"],
  },
  ...getConfiguration({
    typescript: { rootDir: __dirname },
    browser: false,
  }),
];
