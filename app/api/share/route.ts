import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const OWNER = process.env.GITHUB_OWNER || "Pazificateur69";
const REPO = process.env.GITHUB_REPO || "pazent-brain-notes";

// Shared notes stored in notes/_shared/ folder
export async function POST(req: NextRequest) {
  if (req.headers.get("x-app-password") !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path, title, content } = await req.json();
  const shareId = Buffer.from(path + Date.now()).toString("base64url").slice(0, 16);
  const sharePath = `notes/_shared/${shareId}.json`;

  const payload = JSON.stringify({ title, content, path, createdAt: new Date().toISOString() });
  const encoded = Buffer.from(payload).toString("base64");

  await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${sharePath}`, {
    method: "PUT",
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
    body: JSON.stringify({ message: `share: ${title}`, content: encoded }),
  });

  return NextResponse.json({ shareId, url: `/share/${shareId}` });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const shareId = searchParams.get("id");
  if (!shareId) return NextResponse.json({ error: "No id" }, { status: 400 });

  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/notes/_shared/${shareId}.json`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" },
    next: { revalidate: 60 }
  });
  if (!res.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
  return NextResponse.json(content);
}

export async function DELETE(req: NextRequest) {
  if (req.headers.get("x-app-password") !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { shareId } = await req.json();
  const sharePath = `notes/_shared/${shareId}.json`;
  const check = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${sharePath}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` }
  });
  if (!check.ok) return NextResponse.json({ ok: true });
  const d = await check.json();
  await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${sharePath}`, {
    method: "DELETE",
    headers: { Authorization: `token ${GITHUB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: `unshare: ${shareId}`, sha: d.sha }),
  });
  return NextResponse.json({ ok: true });
}
