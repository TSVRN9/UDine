import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import * as ts from "typescript";

// Reanimated's Babel plugin workletizes a callback handed straight to `withTiming`; it cannot see through `timed()`, so a plain callback is
// called on the UI thread as a remote function and throws ("Tried to synchronously call a Remote Function", then a black frame on the emulator).
// Every callback given to `timed` must say "worklet".
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) && !/\.test\./.test(p) ? [p] : []; });
const root = join(__dirname, "..");

function offenders(): string[] {
  const out: string[] = [];
  for (const file of [...walk(join(root, "bakeoff")), ...walk(join(root, "app/bakeoff"))]) {
    const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "timed" && n.arguments[2]) {
        const cb = n.arguments[2];
        if (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) {
          const first = ts.isBlock(cb.body) ? cb.body.statements[0] : undefined;
          const has = !!first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "worklet";
          if (!has) out.push(`${file.slice(root.length + 1)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

it("every callback passed to timed() is a worklet", () => expect(offenders()).toEqual([]));
