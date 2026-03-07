import { describe, expect, it } from "vitest";

import { parsePowerShellJsonStdout } from "@/lib/supabase/admin-rest";

describe("parsePowerShellJsonStdout", () => {
  it("parses JSON with leading BOM and trailing null bytes", () => {
    const raw = `\uFEFF{"status":200,"bodyBase64":""}\u0000\u0000`;
    const parsed = parsePowerShellJsonStdout<{ status: number; bodyBase64: string }>(raw);

    expect(parsed).toEqual({
      status: 200,
      bodyBase64: ""
    });
  });

  it("parses JSON arrays wrapped with surrounding noise", () => {
    const raw = `noise\n[{"status":200},{"status":201}]\u0000tail`;
    const parsed = parsePowerShellJsonStdout<Array<{ status: number }>>(raw);

    expect(parsed).toEqual([{ status: 200 }, { status: 201 }]);
  });
});
