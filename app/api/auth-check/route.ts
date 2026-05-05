import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "../../../lib/auth";

export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: checkAuth(req) }, { status: checkAuth(req) ? 200 : 401 });
}

export async function POST(req: NextRequest) {
  return NextResponse.json({ ok: checkAuth(req) }, { status: checkAuth(req) ? 200 : 401 });
}
