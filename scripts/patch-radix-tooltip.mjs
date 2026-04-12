import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tooltipBundlePath = path.join(
  rootDir,
  "node_modules",
  "@radix-ui",
  "react-tooltip",
  "dist",
  "index.mjs",
);

if (!fs.existsSync(tooltipBundlePath)) {
  console.warn("[patch-radix-tooltip] skipped: tooltip bundle not found");
  process.exit(0);
}

const source = fs.readFileSync(tooltipBundlePath, "utf8");

if (
  source.includes("const triggerRef = React.useRef(null);")
  && source.includes("if (nextTrigger === null)")
) {
  console.log("[patch-radix-tooltip] already applied");
  process.exit(0);
}

const stateTarget = "  const [trigger, setTrigger] = React.useState(null);\n";
const stateReplacement = `${stateTarget}  const triggerRef = React.useRef(null);\n`;
const setterTarget = "      onTriggerChange: setTrigger,\n";
const setterReplacement = `      onTriggerChange: React.useCallback((nextTrigger) => {\n        if (nextTrigger === null) {\n          return;\n        }\n        if (triggerRef.current !== nextTrigger) {\n          triggerRef.current = nextTrigger;\n          setTrigger(nextTrigger);\n        }\n      }, []),\n`;

if (!source.includes(stateTarget) || !source.includes(setterTarget)) {
  console.warn("[patch-radix-tooltip] skipped: unexpected upstream bundle shape");
  process.exit(0);
}

const patched = source
  .replace(stateTarget, stateReplacement)
  .replace(setterTarget, setterReplacement);

fs.writeFileSync(tooltipBundlePath, patched);
console.log("[patch-radix-tooltip] applied");
