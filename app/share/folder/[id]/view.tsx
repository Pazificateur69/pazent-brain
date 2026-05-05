"use client";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { FileText, Folder, FolderOpen, ChevronDown, ChevronRight, Search, Menu, X } from "lucide-react";

interface SharedNote { path: string; name: string; content: string; relativePath: string }
interface FolderShare { title: string; folderPath: string; notes: SharedNote[]; createdAt: string }
interface TreeNode { name: string; notes: SharedNote[]; subfolders: Record<string, TreeNode> }

function buildTree(notes: SharedNote[]): TreeNode {
  const root: TreeNode = { name: "", notes: [], subfolders: {} };
  for (const n of notes) {
    const parts = n.relativePath.split("/");
    if (parts.length === 1) { root.notes.push(n); continue; }
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!node.subfolders[seg]) node.subfolders[seg] = { name: seg, notes: [], subfolders: {} };
      node = node.subfolders[seg];
    }
    node.notes.push(n);
  }
  return root;
}

function FolderRow({ name, node, depth, expanded, toggle, active, onSelect, prefix }: {
  name: string; node: TreeNode; depth: number;
  expanded: Set<string>; toggle: (k: string) => void;
  active: string | null; onSelect: (n: SharedNote) => void; prefix: string;
}) {
  const key = prefix;
  const isOpen = expanded.has(key);
  const total = node.notes.length + Object.values(node.subfolders).reduce((a, b) => a + b.notes.length, 0);
  return (
    <div>
      <button onClick={() => toggle(key)} className="folder-btn" style={{ paddingLeft: 14 + depth * 14 }}>
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {isOpen ? <FolderOpen size={16} /> : <Folder size={16} />}
        <span className="folder-name">{name}</span>
        <span className="folder-count">{total}</span>
      </button>
      {isOpen && (
        <div>
          {node.notes.map(n => (
            <button key={n.path} onClick={() => onSelect(n)} className={`note-btn ${active === n.path ? "active" : ""}`} style={{ paddingLeft: 14 + (depth + 1) * 14 }}>
              <FileText size={14} />
              <span>{n.name}</span>
            </button>
          ))}
          {Object.entries(node.subfolders).map(([k, sub]) => (
            <FolderRow key={k} name={k} node={sub} depth={depth + 1}
              expanded={expanded} toggle={toggle}
              active={active} onSelect={onSelect} prefix={`${prefix}/${k}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FolderShareView({ data }: { data: FolderShare }) {
  const tree = useMemo(() => buildTree(data.notes), [data.notes]);
  const [active, setActive] = useState<SharedNote>(data.notes[0]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>([""]);
    Object.keys(tree.subfolders).forEach(k => s.add(`/${k}`));
    return s;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggle = (k: string) => setExpanded(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s; });

  const filtered = search.trim()
    ? data.notes.filter(n => n.name.toLowerCase().includes(search.toLowerCase()) || n.content.toLowerCase().includes(search.toLowerCase()))
    : null;

  return (
    <div className="brain-share">
      <style>{css}</style>
      <header className="topbar">
        <button className="menu-btn" onClick={() => setSidebarOpen(v => !v)} aria-label="Menu">
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="brand">
          <div className="logo">🧠</div>
          <div>
            <div className="brand-name">pazent.brain</div>
            <div className="brand-sub">{data.title} · {data.notes.length} note{data.notes.length > 1 ? "s" : ""}</div>
          </div>
        </div>
        <a className="cta" href="https://pazent-brain.vercel.app">Créer le tien →</a>
      </header>

      <div className="layout">
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="search-box">
            <Search size={16} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..." />
          </div>

          <nav className="tree">
            {filtered ? (
              <div className="search-results">
                <div className="section-title">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</div>
                {filtered.map(n => (
                  <button key={n.path} onClick={() => { setActive(n); setSidebarOpen(false); }} className={`note-btn ${active.path === n.path ? "active" : ""}`} style={{ paddingLeft: 14 }}>
                    <FileText size={14} />
                    <span>{n.relativePath}</span>
                  </button>
                ))}
              </div>
            ) : (
              <>
                {tree.notes.map(n => (
                  <button key={n.path} onClick={() => { setActive(n); setSidebarOpen(false); }} className={`note-btn ${active.path === n.path ? "active" : ""}`} style={{ paddingLeft: 14 }}>
                    <FileText size={14} />
                    <span>{n.name}</span>
                  </button>
                ))}
                {Object.entries(tree.subfolders).map(([k, sub]) => (
                  <FolderRow key={k} name={k} node={sub} depth={0}
                    expanded={expanded} toggle={toggle}
                    active={active.path} onSelect={n => { setActive(n); setSidebarOpen(false); }} prefix={`/${k}`} />
                ))}
              </>
            )}
          </nav>

          <footer className="side-footer">
            Partagé le {new Date(data.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </footer>
        </aside>

        <main className="content">
          <article className="prose">
            <div className="breadcrumb">{active.relativePath}</div>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {active.content}
            </ReactMarkdown>
          </article>
        </main>
      </div>
    </div>
  );
}

const css = `
:root {
  --bg: #0d1117;
  --surface: #161b22;
  --surface-2: #1c2128;
  --border: #21262d;
  --text: #e6edf3;
  --muted: #8b949e;
  --accent: #a78bfa;
  --accent-2: #6e00ff;
  --cyan: #00d4ff;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bg); color: var(--text); font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
body { min-height: 100vh; }
a { color: var(--cyan); }

.brain-share { min-height: 100vh; display: flex; flex-direction: column; }

.topbar {
  display: flex; align-items: center; gap: 16px; padding: 14px 24px;
  background: rgba(13,17,23,.85); backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 50;
}
.menu-btn { display: none; background: none; border: none; color: var(--text); cursor: pointer; padding: 6px; }
.brand { display: flex; align-items: center; gap: 12px; flex: 1; }
.logo { width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(135deg, var(--accent-2), var(--cyan)); display: grid; place-items: center; font-size: 20px; box-shadow: 0 6px 24px rgba(110,0,255,.35); }
.brand-name { font-weight: 700; font-size: 17px; letter-spacing: -0.3px; }
.brand-sub { font-size: 13px; color: var(--muted); }
.cta { font-size: 14px; padding: 8px 14px; border-radius: 999px; background: rgba(110,0,255,.15); color: var(--accent); border: 1px solid rgba(110,0,255,.3); text-decoration: none; transition: all .2s; }
.cta:hover { background: rgba(110,0,255,.25); transform: translateY(-1px); }

.layout { display: grid; grid-template-columns: 320px 1fr; flex: 1; min-height: 0; }

.sidebar {
  border-right: 1px solid var(--border); background: var(--surface);
  display: flex; flex-direction: column; min-height: calc(100vh - 70px);
  position: sticky; top: 70px; height: calc(100vh - 70px); overflow: hidden;
}
.search-box {
  display: flex; align-items: center; gap: 10px; padding: 16px 18px;
  border-bottom: 1px solid var(--border); color: var(--muted);
}
.search-box input { flex: 1; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; color: var(--text); padding: 8px 12px; font-size: 14px; outline: none; }
.search-box input:focus { border-color: var(--accent-2); }

.tree { flex: 1; overflow-y: auto; padding: 10px 6px; }
.section-title { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); padding: 8px 14px; font-weight: 600; }
.folder-btn, .note-btn {
  display: flex; align-items: center; gap: 8px; width: 100%;
  background: none; border: 1px solid transparent; color: var(--muted);
  padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 14px;
  text-align: left; font-family: inherit; transition: background .15s;
}
.folder-btn { font-weight: 600; color: var(--text); font-size: 13px; }
.folder-btn:hover, .note-btn:hover { background: var(--surface-2); }
.folder-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.folder-count { font-size: 11px; opacity: .5; padding: 1px 8px; border-radius: 999px; background: var(--surface-2); }
.note-btn { color: var(--text); font-size: 14px; }
.note-btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.note-btn.active { background: rgba(110,0,255,.15); border-color: rgba(110,0,255,.4); color: var(--accent); }

.side-footer { padding: 14px 18px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }

.content { padding: 48px 56px; max-width: 100%; overflow-x: hidden; }
.prose { max-width: 820px; margin: 0 auto; line-height: 1.8; font-size: 16px; }
.breadcrumb { display: inline-block; font-size: 12px; color: var(--muted); padding: 4px 12px; border-radius: 999px; background: var(--surface-2); margin-bottom: 24px; font-family: 'JetBrains Mono', monospace; }
.prose h1 { font-size: 2.4rem; font-weight: 800; line-height: 1.2; margin: 1.5rem 0 1rem; letter-spacing: -.5px; background: linear-gradient(135deg, var(--text), var(--accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.prose h2 { font-size: 1.6rem; font-weight: 700; margin: 2rem 0 .8rem; padding-bottom: .4rem; border-bottom: 1px solid var(--border); }
.prose h3 { font-size: 1.2rem; font-weight: 600; margin: 1.4rem 0 .6rem; color: var(--cyan); }
.prose p { margin-bottom: 1.1rem; color: var(--text); }
.prose code { background: rgba(110,0,255,.12); border: 1px solid rgba(110,0,255,.25); padding: .15em .45em; border-radius: 6px; font-family: 'JetBrains Mono', monospace; font-size: .88em; color: var(--accent); }
.prose pre { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.4rem; overflow-x: auto; margin: 1.2rem 0; box-shadow: 0 4px 24px rgba(0,0,0,.3); }
.prose pre code { background: none; border: none; color: var(--text); font-size: .92em; }
.prose ul, .prose ol { padding-left: 1.5rem; margin-bottom: 1.1rem; }
.prose li { margin-bottom: .45rem; }
.prose blockquote { border-left: 3px solid var(--accent-2); padding: .5rem 1rem; opacity: .85; font-style: italic; margin: 1.2rem 0; background: rgba(110,0,255,.05); border-radius: 0 8px 8px 0; }
.prose a { color: var(--cyan); text-decoration: underline; text-underline-offset: 3px; }
.prose table { width: 100%; border-collapse: collapse; margin: 1.2rem 0; font-size: .95em; }
.prose th, .prose td { border: 1px solid var(--border); padding: .7rem 1rem; text-align: left; }
.prose th { background: var(--surface); font-weight: 700; }
.prose strong { font-weight: 700; color: var(--text); }
.prose hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }
.prose img { max-width: 100%; border-radius: 12px; margin: 1.2rem 0; box-shadow: 0 4px 24px rgba(0,0,0,.3); }

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--surface-2); }

@media (max-width: 900px) {
  .menu-btn { display: block; }
  .layout { grid-template-columns: 1fr; }
  .sidebar { position: fixed; top: 70px; left: -100%; width: 86%; max-width: 360px; z-index: 40; transition: left .25s; box-shadow: 8px 0 32px rgba(0,0,0,.5); }
  .sidebar.open { left: 0; }
  .content { padding: 24px 18px; }
  .prose h1 { font-size: 1.8rem; }
  .prose h2 { font-size: 1.3rem; }
  .topbar { padding: 12px 14px; gap: 10px; }
  .brand-name { font-size: 15px; }
  .brand-sub { font-size: 12px; }
  .cta { padding: 6px 10px; font-size: 12px; }
}
@media (prefers-color-scheme: light) {
  /* keep dark for share view — branded look */
}
`;
