const GITHUB_TOKEN = process.env.GITHUB_TOKEN!;
const OWNER = process.env.GITHUB_OWNER || "Pazificateur69";
const REPO = process.env.GITHUB_REPO || "pazent-brain-notes";

const BASE = "https://api.github.com";

async function ghFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
      ...((options?.headers as Record<string, string>) || {}),
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  return res.json();
}

export interface Note {
  path: string;
  name: string;
  content?: string;
  sha?: string;
}

export async function listNotes(dir = "notes"): Promise<Note[]> {
  try {
    const items = await ghFetch(`/repos/${OWNER}/${REPO}/contents/${dir}`);
    const notes: Note[] = [];
    for (const item of items) {
      if (item.type === "dir") {
        const sub = await listNotes(item.path);
        notes.push(...sub);
      } else if (item.name.endsWith(".md")) {
        notes.push({ path: item.path, name: item.name.replace(".md", ""), sha: item.sha });
      }
    }
    return notes;
  } catch {
    return [];
  }
}

export async function getNote(path: string): Promise<Note | null> {
  try {
    const data = await ghFetch(`/repos/${OWNER}/${REPO}/contents/${path}`);
    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return { path, name: path.replace(/^notes\//, "").replace(".md", ""), content, sha: data.sha };
  } catch {
    return null;
  }
}

export async function saveNote(path: string, content: string, sha?: string): Promise<void> {
  const encoded = Buffer.from(content).toString("base64");
  await ghFetch(`/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `update: ${path}`,
      content: encoded,
      ...(sha ? { sha } : {}),
    }),
  });
}

export async function deleteNote(path: string, sha: string): Promise<void> {
  await ghFetch(`/repos/${OWNER}/${REPO}/contents/${path}`, {
    method: "DELETE",
    body: JSON.stringify({ message: `delete: ${path}`, sha }),
  });
}

export async function getTree(): Promise<{ path: string; type: string }[]> {
  try {
    const ref = await ghFetch(`/repos/${OWNER}/${REPO}/git/ref/heads/main`);
    const tree = await ghFetch(`/repos/${OWNER}/${REPO}/git/trees/${ref.object.sha}?recursive=1`);
    return tree.tree.filter((f: { path: string; type: string }) =>
      f.path.startsWith("notes/") && f.path.endsWith(".md")
    );
  } catch {
    return [];
  }
}
