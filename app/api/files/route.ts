import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const OWNER = process.env.GITHUB_OWNER || "Pazificateur69";
const REPO = process.env.GITHUB_REPO || "pazent-brain-notes";

async function listDir(path: string): Promise<{ name: string; path: string; type: string; size: number; download_url: string }[]> {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" },
    next: { revalidate: 0 }
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  const items: { name: string; path: string; type: string; size: number; download_url: string }[] = [];
  for (const item of data) {
    if (item.type === "dir") {
      const sub = await listDir(item.path);
      items.push(...sub);
    } else {
      items.push({ name: item.name, path: item.path, type: item.type, size: item.size || 0, download_url: item.download_url });
    }
  }
  return items;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const folder = searchParams.get("folder") || "files";
  try {
    const items = await listDir(folder);
    return NextResponse.json(items);
  } catch {
    return NextResponse.json([]);
  }
}

export async function DELETE(req: NextRequest) {
  const { path, sha } = await req.json();
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: "DELETE",
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
    body: JSON.stringify({ message: `delete: ${path}`, sha }),
  });
  if (!res.ok) return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
