import { NextRequest } from "next/server";

export function checkAuth(req: NextRequest): boolean {
  const expected = (process.env.APP_PASSWORD || "").trim();
  const got = (req.headers.get("x-app-password") || "").trim();
  return expected.length > 0 && got === expected;
}
