import { NextResponse } from "next/server";

export async function GET() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || "Pazificateur69";
  const repo = process.env.GITHUB_REPO || "pazent-brain-notes";

  const env = {
    GITHUB_TOKEN_present: !!token,
    GITHUB_OWNER: owner,
    GITHUB_REPO: repo,
    APP_PASSWORD_present: !!process.env.APP_PASSWORD,
  };

  if (!token) {
    return NextResponse.json({ ok: false, env, error: "GITHUB_TOKEN missing in Vercel env" });
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/notes`, {
      headers: { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" },
      cache: "no-store",
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* leave as text */ }
    const errMessage = !res.ok && parsed && typeof parsed === "object" && parsed !== null && "message" in parsed
      ? (parsed as { message: string }).message
      : null;
    return NextResponse.json({
      ok: res.ok,
      env,
      githubStatus: res.status,
      githubError: errMessage,
      itemsFound: res.ok && Array.isArray(parsed) ? parsed.length : null,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, env, error: String(e) });
  }
}
