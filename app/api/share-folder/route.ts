import { NextRequest, NextResponse } from "next/server";
import { checkAuth } from "../../../lib/auth";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const OWNER = (process.env.GITHUB_OWNER || "Pazificateur69").trim();
const REPO = (process.env.GITHUB_REPO || "pazent-brain-notes").trim();

async function gh(path: string, init?: RequestInit) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...((init?.headers as Record<string, string>) || {}),
    },
    cache: "no-store",
  });
}

interface GhItem { name: string; path: string; type: "file" | "dir"; sha: string; size: number }
interface NoteEntry { path: string; name: string; content: string; size: number }

async function collectNotes(folder: string): Promise<NoteEntry[]> {
  const res = await gh(`/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(folder).replace(/%2F/g, "/")}`);
  if (!res.ok) return [];
  const items: GhItem[] = await res.json();
  const result: NoteEntry[] = [];
  for (const item of items) {
    if (item.path.includes("_trash") || item.path.includes("_shared") || item.path.includes("_shared_folders")) continue;
    if (item.type === "dir") {
      const sub = await collectNotes(item.path);
      result.push(...sub);
    } else if (item.name.endsWith(".md") && item.name !== ".gitkeep") {
      const blob = await gh(`/repos/${OWNER}/${REPO}/git/blobs/${item.sha}`);
      if (blob.ok) {
        const data = await blob.json();
        const content = Buffer.from((data.content || "").replace(/\n/g, ""), "base64").toString("utf-8");
        result.push({ path: item.path, name: item.name.replace(".md", ""), content, size: item.size });
      }
    }
  }
  return result;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { folderPath, title } = await req.json();
  if (!folderPath || typeof folderPath !== "string") {
    return NextResponse.json({ error: "folderPath required" }, { status: 400 });
  }
  const cleanPath = folderPath.replace(/^\/+|\/+$/g, "");
  if (!cleanPath.startsWith("notes")) {
    return NextResponse.json({ error: "folderPath must be inside notes/" }, { status: 400 });
  }

  const notes = await collectNotes(cleanPath);
  if (notes.length === 0) {
    return NextResponse.json({ error: "Aucune note dans ce dossier" }, { status: 404 });
  }

  const shareId = Buffer.from(cleanPath + Date.now()).toString("base64url").slice(0, 16);
  const sharePath = `notes/_shared_folders/${shareId}.json`;
  const folderName = title || cleanPath.split("/").pop() || "Dossier";

  const payload = JSON.stringify({
    title: folderName,
    folderPath: cleanPath,
    notes: notes.map(n => ({
      path: n.path,
      name: n.name,
      content: n.content,
      relativePath: n.path.replace(`${cleanPath}/`, "").replace(/\.md$/, ""),
    })),
    createdAt: new Date().toISOString(),
  });
  const encoded = Buffer.from(payload).toString("base64");

  const create = await gh(`/repos/${OWNER}/${REPO}/contents/${sharePath}`, {
    method: "PUT",
    body: JSON.stringify({ message: `share folder: ${folderName}`, content: encoded }),
  });
  if (!create.ok) {
    const err = await create.text();
    return NextResponse.json({ error: "GitHub error", detail: err }, { status: 500 });
  }

  return NextResponse.json({ shareId, url: `/share/folder/${shareId}`, count: notes.length });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const res = await gh(`/repos/${OWNER}/${REPO}/contents/notes/_shared_folders/${id}.json`);
  if (!res.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = await res.json();
  const content = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
  return NextResponse.json(content);
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { shareId } = await req.json();
  if (!shareId || !/^[A-Za-z0-9_-]{1,64}$/.test(shareId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const sharePath = `notes/_shared_folders/${shareId}.json`;
  const check = await gh(`/repos/${OWNER}/${REPO}/contents/${sharePath}`);
  if (!check.ok) return NextResponse.json({ ok: true });
  const d = await check.json();
  await gh(`/repos/${OWNER}/${REPO}/contents/${sharePath}`, {
    method: "DELETE",
    body: JSON.stringify({ message: `unshare folder: ${shareId}`, sha: d.sha }),
  });
  return NextResponse.json({ ok: true });
}
