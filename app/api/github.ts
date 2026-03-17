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
  tags?: string[];
}

export function extractTagsFromContent(content: string): string[] {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return [];
  const fm = fmMatch[1];
  // tags: [tag1, tag2]
  const inline = fm.match(/tags:\s*\[([^\]]*)\]/);
  if (inline) {
    return inline[1].split(",").map(t => t.trim().replace(/['"]/g, "")).filter(Boolean);
  }
  // tags:\n  - tag1
  const block = fm.match(/tags:\s*\n((?:[ \t]*-[ \t]*[^\n]+\n?)+)/);
  if (block) {
    return (block[1].match(/-\s*([^\n]+)/g) || []).map(t => t.replace(/^-\s*/, "").trim());
  }
  return [];
}

export async function listNotes(dir = "notes"): Promise<Note[]> {
  try {
    const items = await ghFetch(`/repos/${OWNER}/${REPO}/contents/${dir}`);
    const notes: Note[] = [];
    for (const item of items) {
      if (item.type === "dir") {
        const sub = await listNotes(item.path);
        notes.push(...sub);
      } else if (item.name.endsWith(".md") && item.name !== ".gitkeep") {
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
    const tags = extractTagsFromContent(content);
    return { path, name: path.replace(/^notes\//, "").replace(".md", ""), content, sha: data.sha, tags };
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

export async function getTree(): Promise<{ path: string; type: string; sha: string }[]> {
  try {
    const ref = await ghFetch(`/repos/${OWNER}/${REPO}/git/ref/heads/main`);
    const tree = await ghFetch(`/repos/${OWNER}/${REPO}/git/trees/${ref.object.sha}?recursive=1`);
    return tree.tree.filter((f: { path: string; type: string; sha: string }) =>
      f.path.startsWith("notes/") && f.path.endsWith(".md")
    );
  } catch {
    return [];
  }
}

export async function listNotesWithMeta(): Promise<Array<Note & { tags: string[] }>> {
  const tree = await getTree();
  const results = await Promise.all(
    tree.map(async (item) => {
      try {
        const blob = await ghFetch(`/repos/${OWNER}/${REPO}/git/blobs/${item.sha}`);
        const content = Buffer.from(blob.content.replace(/\n/g, ""), "base64").toString("utf-8");
        const tags = extractTagsFromContent(content);
        return {
          path: item.path,
          name: item.path.split("/").pop()!.replace(".md", ""),
          sha: item.sha,
          tags,
        };
      } catch {
        return { path: item.path, name: item.path.split("/").pop()!.replace(".md", ""), sha: item.sha, tags: [] };
      }
    })
  );
  return results;
}

export async function searchNotes(query: string): Promise<Array<{ path: string; name: string; snippet: string }>> {
  try {
    const data = await ghFetch(
      `/search/code?q=${encodeURIComponent(query)}+repo:${OWNER}/${REPO}+path:notes+extension:md`,
      { headers: { Accept: "application/vnd.github.v3.text-match+json" } } as RequestInit
    );
    return (data.items || []).map((item: { path: string; name: string; text_matches?: Array<{ fragment: string }> }) => ({
      path: item.path,
      name: item.name.replace(".md", ""),
      snippet: item.text_matches?.[0]?.fragment || "",
    }));
  } catch {
    return [];
  }
}

export async function getFileHistory(path: string): Promise<Array<{ sha: string; fullSha: string; date: string; message: string; author: string; url: string }>> {
  try {
    const commits = await ghFetch(`/repos/${OWNER}/${REPO}/commits?path=${encodeURIComponent(path)}&per_page=20`);
    return commits.map((c: { sha: string; html_url: string; commit: { committer: { date: string }; message: string; author: { name: string } } }) => ({
      sha: c.sha.slice(0, 7),
      fullSha: c.sha,
      date: c.commit.committer.date,
      message: c.commit.message.trim(),
      author: c.commit.author.name,
      url: c.html_url,
    }));
  } catch {
    return [];
  }
}

export async function createFolder(folderPath: string): Promise<void> {
  const keepPath = `${folderPath}/.gitkeep`;
  const encoded = Buffer.from("").toString("base64");
  await ghFetch(`/repos/${OWNER}/${REPO}/contents/${keepPath}`, {
    method: "PUT",
    body: JSON.stringify({ message: `create folder: ${folderPath}`, content: encoded }),
  });
}
