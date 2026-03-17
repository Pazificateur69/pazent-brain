import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const OWNER = process.env.GITHUB_OWNER || "Pazificateur69";
const REPO = process.env.GITHUB_REPO || "pazent-brain-notes";

function checkAuth(req: NextRequest) {
  return req.headers.get("x-app-password") === process.env.APP_PASSWORD;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File;
  const folder = (formData.get("folder") as string) || "files";

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const path = `${folder}/${file.name}`;

  // Check if exists
  let sha: string | undefined;
  try {
    const check = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" }
    });
    if (check.ok) {
      const d = await check.json();
      sha = d.sha;
    }
  } catch {}

  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: "PUT",
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `upload: ${file.name}`,
      content: base64,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!res.ok) return NextResponse.json({ error: "Upload failed" }, { status: 500 });

  const data = await res.json();
  const downloadUrl = data.content?.download_url || `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${path}`;

  return NextResponse.json({ ok: true, path, url: downloadUrl, name: file.name, size: file.size, type: file.type });
}
