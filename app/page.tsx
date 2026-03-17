"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  FileText, FolderOpen, Folder, Plus, Search, Save, Trash2, Eye, Edit3,
  ChevronRight, ChevronDown, Lock, Download, FileDown, Code, Hash,
  AlignLeft, Clock, Bold, Italic, List, Link2, Image, X, Check,
  MoreHorizontal, Moon, Keyboard, RefreshCw
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface Note { path: string; name: string; content?: string; sha?: string; }
interface FolderNode { name: string; notes: Note[]; subfolders: Record<string, FolderNode>; }

const PASSWORD_KEY = "pazent_brain_auth";

// ─── Utils ───────────────────────────────────────────────────────────────────

function buildTree(notes: Note[]): FolderNode {
  const root: FolderNode = { name: "root", notes: [], subfolders: {} };
  for (const note of notes) {
    const parts = note.path.replace(/^notes\//, "").split("/");
    if (parts.length === 1) { root.notes.push(note); continue; }
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!node.subfolders[seg]) node.subfolders[seg] = { name: seg, notes: [], subfolders: {} };
      node = node.subfolders[seg];
    }
    node.notes.push(note);
  }
  return root;
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function readTime(text: string) {
  return Math.max(1, Math.round(wordCount(text) / 200));
}

function markdownToHtml(md: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#e6edf3;padding:3rem;max-width:860px;margin:auto;line-height:1.8}
    h1{font-size:2.2rem;font-weight:700;margin:2rem 0 1rem;border-bottom:1px solid #21262d;padding-bottom:.5rem}
    h2{font-size:1.6rem;font-weight:600;margin:1.5rem 0 .8rem}
    h3{font-size:1.2rem;font-weight:500;margin:1.2rem 0 .6rem;color:#00d4ff}
    p{margin-bottom:1rem}
    code{background:#161b22;border:1px solid #21262d;padding:.2em .5em;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:.85em;color:#00d4ff}
    pre{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:1.5rem;overflow-x:auto;margin:1rem 0}
    pre code{background:none;border:none;color:#e6edf3;font-size:.9em}
    ul,ol{padding-left:1.5rem;margin-bottom:1rem}
    li{margin-bottom:.3rem}
    blockquote{border-left:3px solid #6e00ff;padding-left:1rem;color:#8b949e;font-style:italic;margin:1rem 0}
    a{color:#00d4ff}
    table{width:100%;border-collapse:collapse;margin:1rem 0}
    th,td{border:1px solid #21262d;padding:.6rem 1rem}
    th{background:#161b22;font-weight:600}
    strong{color:#fff;font-weight:600}
    hr{border:none;border-top:1px solid #21262d;margin:1.5rem 0}
    .meta{color:#8b949e;font-size:.85rem;margin-bottom:2rem;padding:.75rem;background:#161b22;border-radius:8px;border:1px solid #21262d}
  </style>
</head>
<body>
<div class="meta">📄 ${title} &nbsp;·&nbsp; Exporté depuis <strong>pazent.brain</strong> &nbsp;·&nbsp; ${new Date().toLocaleDateString("fr-FR", { year:"numeric", month:"long", day:"numeric" })}</div>
${md}
</body>
</html>`;
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────

function AuthScreen({ onAuth }: { onAuth: (p: string) => void }) {
  const [pw, setPw] = useState("");
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#0d1117" }}>
      <div style={{ width:360 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:32 }}>
          <div style={{ width:40, height:40, borderRadius:10, background:"linear-gradient(135deg,#6e00ff,#00d4ff)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>🧠</div>
          <div>
            <div style={{ fontWeight:700, fontSize:20, color:"#fff" }}>pazent.brain</div>
            <div style={{ fontSize:12, color:"#8b949e" }}>knowledge base privée</div>
          </div>
        </div>
        <div style={{ background:"#161b22", border:"1px solid #21262d", borderRadius:12, padding:24 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
            <Lock size={15} color="#6e00ff" />
            <span style={{ fontSize:14, fontWeight:500, color:"#e6edf3" }}>Accès protégé</span>
          </div>
          <input
            type="password" placeholder="Mot de passe" value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === "Enter" && onAuth(pw)}
            style={{ width:"100%", padding:"10px 14px", background:"#0d1117", border:"1px solid #21262d", borderRadius:8, color:"#e6edf3", fontSize:14, outline:"none", marginBottom:12 }}
            autoFocus
          />
          <button
            onClick={() => onAuth(pw)}
            style={{ width:"100%", padding:"10px 14px", background:"linear-gradient(135deg,#6e00ff,#5500cc)", border:"none", borderRadius:8, color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer" }}
          >
            Entrer →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function insertMarkdown(ref: React.RefObject<HTMLTextAreaElement>, before: string, after = "", placeholder = "") {
  const el = ref.current;
  if (!el) return;
  const start = el.selectionStart, end = el.selectionEnd;
  const selected = el.value.slice(start, end) || placeholder;
  const newVal = el.value.slice(0, start) + before + selected + after + el.value.slice(end);
  el.value = newVal;
  el.focus();
  el.setSelectionRange(start + before.length, start + before.length + selected.length);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function Brain() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [active, setActive] = useState<Note | null>(null);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [preview, setPreview] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newNoteName, setNewNoteName] = useState("");
  const [newNoteFolder, setNewNoteFolder] = useState("notes");
  const [creating, setCreating] = useState(false);
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["cybersec","projets","cours","ressources"]));
  const [showDownload, setShowDownload] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const s = sessionStorage.getItem(PASSWORD_KEY);
    if (s) { setPassword(s); setAuthed(true); }
    setLoading(false);
  }, []);

  const fetchNotes = useCallback(async () => {
    const res = await fetch("/api/notes");
    const data = await res.json();
    setNotes(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => { if (authed) fetchNotes(); }, [authed, fetchNotes]);

  function handleAuth(pw: string) {
    sessionStorage.setItem(PASSWORD_KEY, pw);
    setPassword(pw);
    setAuthed(true);
  }

  async function openNote(note: Note) {
    const res = await fetch(`/api/notes?path=${encodeURIComponent(note.path)}`);
    const data = await res.json();
    setActive(data);
    setContent(data.content || "");
    setOriginalContent(data.content || "");
    setPreview(false);
    setShowDownload(false);
  }

  async function saveNote() {
    if (!active || saving) return;
    setSaving(true);
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-password": password },
      body: JSON.stringify({ path: active.path, content, sha: active.sha }),
    });
    const updated = await fetch(`/api/notes?path=${encodeURIComponent(active.path)}`).then(r => r.json());
    setActive(updated);
    setOriginalContent(content);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function deleteNote() {
    if (!active) return;
    setDeleting(true);
    await fetch("/api/notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-app-password": password },
      body: JSON.stringify({ path: active.path, sha: active.sha }),
    });
    setActive(null);
    setContent("");
    setDeleting(false);
    fetchNotes();
  }

  async function createNote() {
    if (!newNoteName.trim()) return;
    const slug = newNoteName.trim().replace(/ /g, "-").toLowerCase();
    const path = `${newNoteFolder}/${slug}.md`;
    const initial = `# ${newNoteName.trim()}\n\n`;
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-password": password },
      body: JSON.stringify({ path, content: initial }),
    });
    setNewNoteName("");
    setCreating(false);
    await fetchNotes();
    await openNote({ path, name: newNoteName.trim() });
  }

  function downloadMd() {
    if (!active) return;
    const blob = new Blob([content], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${active.name}.md`;
    a.click();
  }

  function downloadHtml() {
    if (!active) return;
    const html = markdownToHtml(content, active.name);
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${active.name}.html`;
    a.click();
  }

  function downloadTxt() {
    if (!active) return;
    const blob = new Blob([content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${active.name}.txt`;
    a.click();
  }

  function printPdf() {
    if (!active) return;
    const html = markdownToHtml(content, active.name);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.print(); };
  }

  const isDirty = content !== originalContent;
  const tree = buildTree(notes);
  const folders = Object.keys(tree.subfolders);

  const filtered = search
    ? notes.filter(n => n.name.toLowerCase().includes(search.toLowerCase()) || n.path.toLowerCase().includes(search.toLowerCase()))
    : null;

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); saveNote(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "p") { e.preventDefault(); setPreview(v => !v); }
      if (e.key === "Escape") { setShowDownload(false); setCreating(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (loading) return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#0d1117", color:"#8b949e", fontSize:14 }}>chargement...</div>;
  if (!authed) return <AuthScreen onAuth={handleAuth} />;

  return (
    <div style={{ display:"flex", height:"100vh", background:"#0d1117", color:"#e6edf3", fontFamily:"'Inter',sans-serif", overflow:"hidden" }}>

      {/* ── Sidebar ── */}
      <aside style={{ width:260, minWidth:260, background:"#0d1117", borderRight:"1px solid #21262d", display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Logo */}
        <div style={{ padding:"16px 16px 12px", borderBottom:"1px solid #21262d" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:"linear-gradient(135deg,#6e00ff,#00d4ff)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>🧠</div>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:"#fff", letterSpacing:"-0.3px" }}>pazent.brain</div>
              <div style={{ fontSize:11, color:"#8b949e" }}>{notes.length} notes</div>
            </div>
            <button onClick={fetchNotes} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", color:"#8b949e", padding:4, borderRadius:4 }} title="Actualiser">
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding:"10px 12px 6px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", background:"#161b22", border:"1px solid #21262d", borderRadius:8 }}>
            <Search size={13} color="#8b949e" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher..." 
              style={{ background:"none", border:"none", outline:"none", color:"#e6edf3", fontSize:13, width:"100%" }}
            />
            {search && <button onClick={() => setSearch("")} style={{ background:"none", border:"none", cursor:"pointer", color:"#8b949e", padding:0 }}><X size={12} /></button>}
          </div>
        </div>

        {/* New note button */}
        <div style={{ padding:"4px 12px 8px" }}>
          {creating ? (
            <div style={{ background:"#161b22", border:"1px solid #6e00ff44", borderRadius:8, padding:10 }}>
              <input
                value={newNoteName} onChange={e => setNewNoteName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createNote()}
                placeholder="Nom de la note..." autoFocus
                style={{ width:"100%", background:"none", border:"none", outline:"none", color:"#e6edf3", fontSize:13, marginBottom:8 }}
              />
              <select
                value={newNoteFolder} onChange={e => setNewNoteFolder(e.target.value)}
                style={{ width:"100%", background:"#0d1117", border:"1px solid #21262d", borderRadius:6, color:"#8b949e", fontSize:12, padding:"4px 8px", marginBottom:8, outline:"none" }}
              >
                <option value="notes">📄 Racine</option>
                {folders.map(f => <option key={f} value={`notes/${f}`}>📁 {f}</option>)}
              </select>
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={createNote} style={{ flex:1, padding:"6px 0", background:"#6e00ff", border:"none", borderRadius:6, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>Créer</button>
                <button onClick={() => setCreating(false)} style={{ padding:"6px 10px", background:"#21262d", border:"none", borderRadius:6, color:"#8b949e", fontSize:12, cursor:"pointer" }}>✕</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"7px 10px", background:"#161b2200", border:"1px dashed #21262d", borderRadius:8, color:"#8b949e", fontSize:13, cursor:"pointer", transition:"all .15s" }}
              onMouseEnter={e => { (e.currentTarget.style.borderColor = "#6e00ff44"); (e.currentTarget.style.color = "#6e00ff"); }}
              onMouseLeave={e => { (e.currentTarget.style.borderColor = "#21262d"); (e.currentTarget.style.color = "#8b949e"); }}
            >
              <Plus size={13} /> Nouvelle note
            </button>
          )}
        </div>

        {/* Notes tree */}
        <nav style={{ flex:1, overflowY:"auto", padding:"4px 8px 16px" }}>
          {search && filtered ? (
            <div>
              <div style={{ padding:"4px 8px", fontSize:11, color:"#8b949e", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px" }}>
                {filtered.length} résultat{filtered.length !== 1 ? "s" : ""}
              </div>
              {filtered.map(n => <NoteRow key={n.path} note={n} active={active} onClick={() => openNote(n)} />)}
            </div>
          ) : (
            <>
              {/* Root notes */}
              {tree.notes.map(n => <NoteRow key={n.path} note={n} active={active} onClick={() => openNote(n)} />)}
              {/* Folders */}
              {folders.map(folder => (
                <div key={folder} style={{ marginTop:4 }}>
                  <button
                    onClick={() => setExpandedFolders(prev => { const s = new Set(prev); s.has(folder) ? s.delete(folder) : s.add(folder); return s; })}
                    style={{ display:"flex", alignItems:"center", gap:6, width:"100%", padding:"5px 8px", background:"none", border:"none", color:"#8b949e", fontSize:12, fontWeight:600, cursor:"pointer", borderRadius:6, textTransform:"uppercase", letterSpacing:"0.5px" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#161b22")}
                    onMouseLeave={e => (e.currentTarget.style.background = "none")}
                  >
                    {expandedFolders.has(folder) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {expandedFolders.has(folder) ? <FolderOpen size={12} /> : <Folder size={12} />}
                    {folder}
                    <span style={{ marginLeft:"auto", fontSize:10, opacity:.6 }}>{tree.subfolders[folder].notes.length}</span>
                  </button>
                  {expandedFolders.has(folder) && (
                    <div style={{ paddingLeft:12 }}>
                      {tree.subfolders[folder].notes.map(n => <NoteRow key={n.path} note={n} active={active} onClick={() => openNote(n)} />)}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </nav>

        {/* Footer */}
        <div style={{ padding:"8px 12px", borderTop:"1px solid #21262d", fontSize:11, color:"#8b949e", display:"flex", alignItems:"center", gap:6 }}>
          <Keyboard size={11} />
          <span>Ctrl+S sauvegarder · Ctrl+P preview</span>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", position:"relative" }}>

        {/* Topbar */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"0 16px", height:48, borderBottom:"1px solid #21262d", background:"#0d1117", flexShrink:0 }}>
          {active ? (
            <>
              {/* Breadcrumb */}
              <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, color:"#8b949e", flex:1, minWidth:0 }}>
                <span style={{ color:"#8b949e" }}>notes</span>
                {active.path.includes("/", 6) && (
                  <>
                    <ChevronRight size={12} />
                    <span style={{ color:"#8b949e" }}>{active.path.replace(/^notes\//, "").split("/")[0]}</span>
                  </>
                )}
                <ChevronRight size={12} />
                <span style={{ color:"#e6edf3", fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{active.name}</span>
                {isDirty && <span style={{ width:6, height:6, borderRadius:"50%", background:"#6e00ff", flexShrink:0 }} title="Non sauvegardé" />}
              </div>

              {/* Stats */}
              <div style={{ display:"flex", alignItems:"center", gap:12, fontSize:12, color:"#8b949e" }}>
                <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <AlignLeft size={11} /> {wordCount(content)} mots
                </span>
                <span style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <Clock size={11} /> {readTime(content)} min
                </span>
              </div>

              {/* Actions */}
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <button
                  onClick={() => setPreview(!preview)}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", background: preview ? "#6e00ff22" : "#161b22", border:`1px solid ${preview ? "#6e00ff44" : "#21262d"}`, borderRadius:7, color: preview ? "#6e00ff" : "#8b949e", fontSize:12, cursor:"pointer" }}
                >
                  {preview ? <Edit3 size={13} /> : <Eye size={13} />}
                  {preview ? "Éditer" : "Preview"}
                </button>

                {/* Download dropdown */}
                <div style={{ position:"relative" }}>
                  <button
                    onClick={() => setShowDownload(!showDownload)}
                    style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", background:"#161b22", border:"1px solid #21262d", borderRadius:7, color:"#8b949e", fontSize:12, cursor:"pointer" }}
                  >
                    <Download size={13} /> Exporter
                  </button>
                  {showDownload && (
                    <div style={{ position:"absolute", top:"calc(100% + 6px)", right:0, background:"#161b22", border:"1px solid #21262d", borderRadius:10, padding:6, zIndex:100, minWidth:160, boxShadow:"0 8px 32px #00000066" }}>
                      {[
                        { icon:<FileDown size={13}/>, label:"Markdown (.md)", fn: downloadMd },
                        { icon:<Code size={13}/>, label:"HTML (.html)", fn: downloadHtml },
                        { icon:<Hash size={13}/>, label:"Texte brut (.txt)", fn: downloadTxt },
                        { icon:<FileText size={13}/>, label:"PDF (imprimer)", fn: printPdf },
                      ].map(({ icon, label, fn }) => (
                        <button key={label} onClick={() => { fn(); setShowDownload(false); }}
                          style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"8px 12px", background:"none", border:"none", borderRadius:7, color:"#e6edf3", fontSize:13, cursor:"pointer", textAlign:"left" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#21262d")}
                          onMouseLeave={e => (e.currentTarget.style.background = "none")}
                        >
                          <span style={{ color:"#8b949e" }}>{icon}</span> {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={saveNote} disabled={saving || !isDirty}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 12px", background: saved ? "#00d4ff22" : isDirty ? "#6e00ff" : "#161b22", border:`1px solid ${saved ? "#00d4ff44" : isDirty ? "transparent" : "#21262d"}`, borderRadius:7, color: saved ? "#00d4ff" : isDirty ? "#fff" : "#8b949e", fontSize:12, fontWeight:600, cursor: isDirty ? "pointer" : "default", opacity: saving ? .6 : 1 }}
                >
                  {saved ? <Check size={13} /> : <Save size={13} />}
                  {saved ? "Sauvegardé" : saving ? "..." : "Sauvegarder"}
                </button>

                <button
                  onClick={deleteNote} disabled={deleting}
                  style={{ padding:"5px 8px", background:"none", border:"1px solid #21262d", borderRadius:7, color:"#8b949e", cursor:"pointer" }}
                  onMouseEnter={e => { (e.currentTarget.style.borderColor = "#ff444444"); (e.currentTarget.style.color = "#ff4444"); }}
                  onMouseLeave={e => { (e.currentTarget.style.borderColor = "#21262d"); (e.currentTarget.style.color = "#8b949e"); }}
                  title="Supprimer"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </>
          ) : (
            <div style={{ fontSize:13, color:"#8b949e" }}>← Sélectionne ou crée une note</div>
          )}
        </div>

        {/* Markdown toolbar (editor only) */}
        {active && !preview && (
          <div style={{ display:"flex", alignItems:"center", gap:2, padding:"4px 16px", borderBottom:"1px solid #21262d", background:"#0d1117", flexShrink:0 }}>
            {[
              { icon:<Bold size={13}/>, before:"**", after:"**", ph:"gras" },
              { icon:<Italic size={13}/>, before:"*", after:"*", ph:"italique" },
              { icon:<Hash size={13}/>, before:"# ", after:"", ph:"titre" },
              { icon:<List size={13}/>, before:"- ", after:"", ph:"item" },
              { icon:<Link2 size={13}/>, before:"[", after:"](url)", ph:"lien" },
              { icon:<Image size={13}/>, before:"![", after:"](url)", ph:"image" },
              { icon:<Code size={13}/>, before:"```\n", after:"\n```", ph:"code" },
            ].map(({ icon, before, after, ph }, i) => (
              <button key={i} onClick={() => insertMarkdown(textareaRef, before, after, ph)}
                style={{ padding:"3px 7px", background:"none", border:"none", borderRadius:5, color:"#8b949e", cursor:"pointer" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#161b22")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}
              >
                {icon}
              </button>
            ))}
          </div>
        )}

        {/* Editor / Preview */}
        <div style={{ flex:1, overflow:"hidden", position:"relative" }}>
          {!active ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", gap:16, color:"#8b949e" }}>
              <div style={{ width:64, height:64, borderRadius:16, background:"linear-gradient(135deg,#6e00ff11,#00d4ff11)", border:"1px solid #21262d", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28 }}>🧠</div>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:15, fontWeight:500, color:"#e6edf3", marginBottom:6 }}>Aucune note sélectionnée</div>
                <div style={{ fontSize:13, color:"#8b949e" }}>Sélectionne une note dans la sidebar ou crée-en une nouvelle</div>
              </div>
              <button onClick={() => setCreating(true)} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 16px", background:"#6e00ff", border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                <Plus size={14} /> Nouvelle note
              </button>
            </div>
          ) : preview ? (
            <div style={{ height:"100%", overflowY:"auto", padding:"40px 60px" }}>
              <article className="prose" style={{ maxWidth:760, margin:"0 auto" }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                  {content}
                </ReactMarkdown>
              </article>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              style={{
                width:"100%", height:"100%", padding:"40px 60px",
                background:"#0d1117", color:"#e6edf3",
                border:"none", outline:"none", resize:"none",
                fontFamily:"'JetBrains Mono',monospace", fontSize:14, lineHeight:1.9,
                caretColor:"#00d4ff",
              }}
              placeholder="Commence à écrire en Markdown..."
              spellCheck={false}
            />
          )}
        </div>
      </main>

      {/* Click outside to close dropdown */}
      {showDownload && <div onClick={() => setShowDownload(false)} style={{ position:"fixed", inset:0, zIndex:50 }} />}
    </div>
  );
}

function NoteRow({ note, active, onClick }: { note: Note; active: Note | null; onClick: () => void }) {
  const isActive = active?.path === note.path;
  const name = note.path.split("/").pop()?.replace(".md", "") || note.name;
  return (
    <button onClick={onClick}
      style={{ display:"flex", alignItems:"center", gap:7, width:"100%", padding:"5px 8px", background: isActive ? "#6e00ff18" : "none", border:`1px solid ${isActive ? "#6e00ff33" : "transparent"}`, borderRadius:7, color: isActive ? "#a78bfa" : "#c9d1d9", fontSize:13, cursor:"pointer", textAlign:"left", marginBottom:1 }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#161b22"; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "none"; }}
    >
      <FileText size={12} color={isActive ? "#6e00ff" : "#8b949e"} style={{ flexShrink:0 }} />
      <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</span>
    </button>
  );
}
