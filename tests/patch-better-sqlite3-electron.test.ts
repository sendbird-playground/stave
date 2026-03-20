import { describe, expect, test } from "bun:test";
import { patchScopedSourceBlock } from "../scripts/patch-better-sqlite3-electron.mjs";

describe("better-sqlite3 Electron patching", () => {
  test("patches only the targeted NODE_GETTER block", () => {
    const source = `NODE_METHOD(Statement::JS_bind) {
\tStatement* stmt = Unwrap<Statement>(info.This());
}

NODE_GETTER(Statement::JS_busy) {
\tStatement* stmt = Unwrap<Statement>(info.This());
\tinfo.GetReturnValue().Set(stmt->busy);
}
`;

    const patched = patchScopedSourceBlock({
      source,
      signature: "NODE_GETTER(Statement::JS_busy) {",
      from: "Statement* stmt = Unwrap<Statement>(info.This());",
      to: "Statement* stmt = Unwrap<Statement>(info.HolderV2());",
    });

    expect(patched).toContain("NODE_METHOD(Statement::JS_bind) {\n\tStatement* stmt = Unwrap<Statement>(info.This());");
    expect(patched).toContain("NODE_GETTER(Statement::JS_busy) {\n\tStatement* stmt = Unwrap<Statement>(info.HolderV2());");
  });

  test("is idempotent when the target block is already patched", () => {
    const source = `NODE_GETTER(Database::JS_open) {
\tinfo.GetReturnValue().Set(Unwrap<Database>(info.HolderV2())->open);
}
`;

    const patched = patchScopedSourceBlock({
      source,
      signature: "NODE_GETTER(Database::JS_open) {",
      from: "info.GetReturnValue().Set(Unwrap<Database>(info.This())->open);",
      to: "info.GetReturnValue().Set(Unwrap<Database>(info.HolderV2())->open);",
    });

    expect(patched).toBe(source);
  });

  test("throws when the signature exists but the expected line is outside the target block", () => {
    const source = `NODE_METHOD(Database::JS_close) {
\tDatabase* db = Unwrap<Database>(info.This());
}

NODE_GETTER(Database::JS_inTransaction) {
\treturn;
}
`;

    expect(() => patchScopedSourceBlock({
      source,
      signature: "NODE_GETTER(Database::JS_inTransaction) {",
      from: "Database* db = Unwrap<Database>(info.This());",
      to: "Database* db = Unwrap<Database>(info.HolderV2());",
    })).toThrow("Patch target not found inside NODE_GETTER(Database::JS_inTransaction) {");
  });
});
