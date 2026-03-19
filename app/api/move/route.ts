import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const OWNER = process.env.GITHUB_OWNER || "Pazificateur69";
const REPO = process.env.GITHUB_REPO || "pazent-brain-notes";

async function ghFetch(path: string, options?: RequestInit) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
    ...options,
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...((options?.headers as Record<string, string>) || {}),
    },
    next: { revalidate: 0 },
  });
  return res;
}

// Move/rename a note: copy to new path, delete old
export async function POST(req: NextRequest) {
  if (req.headers.get("x-app-password") !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { oldPath, newPath } = await req.json();
  if (!oldPath || !newPath) return NextResponse.json({ error: "Missing paths" }, { status: 400 });

  // Get old file
  const getRes = await ghFetch(oldPath);
  if (!getRes.ok) return NextResponse.json({ error: "Source not found" }, { status: 404 });
  const oldFile = await getRes.json();

  // Create new file
  const createRes = await ghFetch(newPath, {
    method: "PUT",
    body: JSON.stringify({
      message: `move: ${oldPath} → ${newPath}`,
      content: oldFile.content.replace(/\n/g, ""),
    }),
  });
  if (!createRes.ok) return NextResponse.json({ error: "Failed to create" }, { status: 500 });

  // Delete old file
  await ghFetch(oldPath, {
    method: "DELETE",
    body: JSON.stringify({ message: `delete: ${oldPath}`, sha: oldFile.sha }),
  });

  return NextResponse.json({ ok: true, newPath });
}
