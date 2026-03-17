"use client";
import { useEffect, useState, useCallback } from "react";
import { FileText, FolderOpen, Plus, Search, Save, Trash2, Eye, Edit3, Menu, X, ChevronRight, Lock, Brain as BrainIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface Note { path: string; name: string; content?: string; sha?: string; }

const PASSWORD_KEY = "pazent_brain_auth";

export default function Brain() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [active, setActive] = useState<Note | null>(null);
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [newNoteName, setNewNoteName] = useState("");
  const [creating, setCreating] = useState(false);
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = sessionStorage.getItem(PASSWORD_KEY);
    if (saved) { setPassword(saved); setAuthed(true); }
    setLoading(false);
  }, []);

  const fetchNotes = useCallback(async () => {
    const res = await fetch("/api/notes");
    const data = await res.json();
    setNotes(data);
  }, []);

  useEffect(() => { if (authed) fetchNotes(); }, [authed, fetchNotes]);

  async function openNote(note: Note) {
    const res = await fetch(`/api/notes?path=${encodeURIComponent(note.path)}`);
    const data = await res.json();
    setActive(data);
    setContent(data.content || "");
    setPreview(false);
  }

  async function saveNote() {
    if (!active) return;
    setSaving(true);
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-password": password },
      body: JSON.stringify({ path: active.path, content, sha: active.sha }),
    });
    const updated = await fetch(`/api/notes?path=${encodeURIComponent(active.path)}`).then(r => r.json());
    setActive(updated);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function deleteNote() {
    if (!active || !confirm(`Supprimer "${active.name}" ?`)) return;
    await fetch("/api/notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-app-password": password },
      body: JSON.stringify({ path: active.path, sha: active.sha }),
    });
    setActive(null);
    setContent("");
    fetchNotes();
  }

  async function createNote() {
    if (!newNoteName.trim()) return;
    const folder = newNoteName.includes("/") ? "" : "notes/";
    const path = `${folder}${newNoteName.replace(/ /g, "-").toLowerCase()}.md`;
    const initial = `# ${newNoteName}\n\n`;
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-password": password },
      body: JSON.stringify({ path, content: initial }),
    });
    setNewNoteName("");
    setCreating(false);
    await fetchNotes();
    const note = { path, name: newNoteName };
    await openNote(note);
  }

  function handleAuth() {
    sessionStorage.setItem(PASSWORD_KEY, password);
    setAuthed(true);
    setAuthError(false);
  }

  // Group notes by folder
  const grouped = notes.reduce((acc, note) => {
    const parts = note.path.replace("notes/", "").split("/");
    const folder = parts.length > 1 ? parts[0] : "📄 Racine";
    if (!acc[folder]) acc[folder] = [];
    acc[folder].push(note);
    return acc;
  }, {} as Record<string, Note[]>);

  const filtered = search
    ? notes.filter(n => n.name.toLowerCase().includes(search.toLowerCase()))
    : null;

  if (loading) return (
    <div className="flex items-center justify-center h-screen" style={{ background: "#0d1117" }}>
      <div className="text-muted animate-pulse">chargement...</div>
    </div>
  );

  if (!authed) return (
    <div className="flex items-center justify-center h-screen" style={{ background: "#0d1117" }}>
      <div className="w-80 animate-in">
        <div className="flex items-center gap-3 mb-8">
          <BrainIcon className="w-8 h-8" style={{ color: "#6e00ff" }} />
          <div>
            <h1 className="text-xl font-semibold text-white">pazent.brain</h1>
            <p className="text-xs" style={{ color: "#8b949e" }}>knowledge base</p>
          </div>
        </div>
        <div className="p-6 rounded-xl border" style={{ background: "#161b22", borderColor: "#21262d" }}>
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4" style={{ color: "#6e00ff" }} />
            <span className="text-sm font-medium">Accès privé</span>
          </div>
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAuth()}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-3"
            style={{ background: "#0d1117", border: "1px solid #21262d", color: "#e6edf3" }}
            autoFocus
          />
          {authError && <p className="text-red-400 text-xs mb-3">Mot de passe incorrect</p>}
          <button
            onClick={handleAuth}
            className="w-full py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "#6e00ff", color: "white" }}
          >
            Entrer
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen" style={{ background: "#0d1117" }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col border-r transition-all duration-300"
        style={{
          width: sidebarOpen ? "260px" : "0px",
          minWidth: sidebarOpen ? "260px" : "0px",
          background: "#161b22",
          borderColor: "#21262d",
          overflow: "hidden",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b" style={{ borderColor: "#21262d" }}>
          <BrainIcon className="w-5 h-5 flex-shrink-0" style={{ color: "#6e00ff" }} />
          <span className="font-semibold text-sm text-white whitespace-nowrap">pazent.brain</span>
          <span className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{ background: "#21262d", color: "#8b949e" }}>
            {notes.length}
          </span>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "#0d1117", border: "1px solid #21262d" }}>
            <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#8b949e" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className="bg-transparent text-sm outline-none w-full"
              style={{ color: "#e6edf3" }}
            />
          </div>
        </div>

        {/* New note */}
        <div className="px-3 pb-2">
          {creating ? (
            <div className="flex gap-1">
              <input
                value={newNoteName}
                onChange={e => setNewNoteName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createNote()}
                placeholder="Nom de la note..."
                className="flex-1 px-2 py-1.5 rounded text-xs outline-none"
                style={{ background: "#0d1117", border: "1px solid #6e00ff", color: "#e6edf3" }}
                autoFocus
              />
              <button onClick={createNote} className="px-2 py-1.5 rounded text-xs" style={{ background: "#6e00ff", color: "white" }}>OK</button>
              <button onClick={() => setCreating(false)} className="px-2 py-1.5 rounded text-xs" style={{ background: "#21262d", color: "#8b949e" }}>✕</button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs transition-colors hover:opacity-80"
              style={{ background: "#6e00ff22", color: "#6e00ff", border: "1px solid #6e00ff44" }}
            >
              <Plus className="w-3.5 h-3.5" /> Nouvelle note
            </button>
          )}
        </div>

        {/* Notes list */}
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {search && filtered ? (
            <div>
              <div className="px-2 py-1 text-xs font-medium" style={{ color: "#8b949e" }}>
                Résultats ({filtered.length})
              </div>
              {filtered.map(note => (
                <NoteItem key={note.path} note={note} active={active} onClick={() => openNote(note)} />
              ))}
            </div>
          ) : (
            Object.entries(grouped).map(([folder, folderNotes]) => (
              <div key={folder} className="mb-2">
                <div className="flex items-center gap-1 px-2 py-1 text-xs font-medium" style={{ color: "#8b949e" }}>
                  <FolderOpen className="w-3 h-3" />
                  {folder}
                </div>
                {folderNotes.map(note => (
                  <NoteItem key={note.path} note={note} active={active} onClick={() => openNote(note)} />
                ))}
              </div>
            ))
          )}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ background: "#161b22", borderColor: "#21262d" }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded transition-colors hover:opacity-70"
            style={{ color: "#8b949e" }}
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          {active && (
            <>
              <ChevronRight className="w-3.5 h-3.5" style={{ color: "#21262d" }} />
              <span className="text-sm font-medium text-white truncate">{active.name}</span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setPreview(!preview)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
                  style={{
                    background: preview ? "#6e00ff33" : "#21262d",
                    color: preview ? "#6e00ff" : "#8b949e",
                    border: preview ? "1px solid #6e00ff66" : "1px solid transparent",
                  }}
                >
                  {preview ? <Edit3 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {preview ? "Éditer" : "Preview"}
                </button>
                <button
                  onClick={saveNote}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: saved ? "#00d4ff22" : "#6e00ff",
                    color: saved ? "#00d4ff" : "white",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  <Save className="w-3 h-3" />
                  {saved ? "Sauvegardé ✓" : saving ? "..." : "Sauvegarder"}
                </button>
                <button
                  onClick={deleteNote}
                  className="p-1.5 rounded-lg transition-colors hover:opacity-70"
                  style={{ color: "#8b949e" }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Editor / Preview */}
        <div className="flex-1 overflow-hidden">
          {!active ? (
            <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: "#8b949e" }}>
              <BrainIcon className="w-16 h-16 opacity-20" style={{ color: "#6e00ff" }} />
              <p className="text-sm">Sélectionne une note ou crée-en une nouvelle</p>
            </div>
          ) : preview ? (
            <div className="h-full overflow-y-auto px-12 py-8">
              <article className="prose max-w-3xl mx-auto animate-in">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                  {content}
                </ReactMarkdown>
              </article>
            </div>
          ) : (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full h-full p-8 outline-none resize-none font-mono text-sm leading-relaxed animate-in"
              style={{
                background: "#0d1117",
                color: "#e6edf3",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "14px",
                lineHeight: "1.8",
              }}
              placeholder="Commence à écrire en Markdown..."
              onKeyDown={e => {
                if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                  e.preventDefault();
                  saveNote();
                }
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function NoteItem({ note, active, onClick }: { note: Note; active: Note | null; onClick: () => void }) {
  const isActive = active?.path === note.path;
  const name = note.path.replace(/^notes\//, "").replace(/^.*\//, "").replace(".md", "");
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm text-left transition-colors mb-0.5"
      style={{
        background: isActive ? "#6e00ff22" : "transparent",
        color: isActive ? "#6e00ff" : "#e6edf3",
        border: isActive ? "1px solid #6e00ff33" : "1px solid transparent",
      }}
    >
      <FileText className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isActive ? "#6e00ff" : "#8b949e" }} />
      <span className="truncate">{name}</span>
    </button>
  );
}
