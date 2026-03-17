import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const OWNER = process.env.GITHUB_OWNER || "Pazificateur69";
const REPO = process.env.GITHUB_REPO || "pazent-brain-notes";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/commits?path=${encodeURIComponent(path)}&per_page=20`,
    { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github.v3+json" }, next: { revalidate: 0 } }
  );
  if (!res.ok) return NextResponse.json([], { status: 200 });
  const commits = await res.json();
  return NextResponse.json(commits.map((c: { sha: string; commit: { message: string; author: { date: string } } }) => ({
    sha: c.sha,
    message: c.commit.message,
    date: c.commit.author.date,
  })));
}
