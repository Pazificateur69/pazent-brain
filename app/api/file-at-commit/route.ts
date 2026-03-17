import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const OWNER = process.env.GITHUB_OWNER || "Pazificateur69";
const REPO = process.env.GITHUB_REPO || "pazent-brain-notes";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");
  const sha = searchParams.get("sha");
  if (!path || !sha) return NextResponse.json({ error: "path and sha required" }, { status: 400 });

  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${sha}`,
    { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" }, next: { revalidate: 0 } }
  );
  if (!res.ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return NextResponse.json({ content });
}
