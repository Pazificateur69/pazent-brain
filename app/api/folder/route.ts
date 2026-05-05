import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "../../../lib/auth";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const OWNER = (process.env.GITHUB_OWNER || "Pazificateur69").trim();
const REPO = (process.env.GITHUB_REPO || "pazent-brain-notes").trim();

// Create a folder by creating a .gitkeep file inside it
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { path } = await req.json();
  if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });

  const keepPath = `${path.replace(/\/$/, "")}/.gitkeep`;
  const encoded = Buffer.from("").toString("base64");

  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${keepPath}`, {
    method: "PUT",
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: `create folder: ${path}`, content: encoded }),
  });

  if (!res.ok) {
    const err = await res.json();
    return NextResponse.json({ error: err.message }, { status: res.status });
  }

  return NextResponse.json({ ok: true, path });
}
