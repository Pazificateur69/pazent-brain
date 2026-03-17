"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  FileText, FolderOpen, Folder, Plus, Search, Save, Trash2, Eye, Edit3,
  ChevronRight, ChevronDown, Lock, Download, FileDown, Code, Hash,
  AlignLeft, Clock, Bold, Italic, List, Link2, X, Check, Star,
  RefreshCw, Columns, Maximize2, Minimize2, History, BookTemplate,
  Tag, List as ListIcon, Keyboard
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface Note { path: string; name: string; content?: string; sha?: string; }
interface FolderNode { name: string; notes: Note[]; subfolders: Record<string, FolderNode>; }

const PASSWORD_KEY = "pazent_brain_auth";
const FAVS_KEY = "pazent_brain_favs";

const TEMPLATES: Record<string, string> = {
  "Writeup CTF": `# Writeup — [Nom du challenge]

**Plateforme:** HackTheBox / TryHackMe / PicoCTF
**Catégorie:** Web / Pwn / Crypto / Forensics / Misc
**Difficulté:** Easy / Medium / Hard
**Date:** ${new Date().toLocaleDateString("fr-FR")}

---

## Reconnaissance

## Exploitation

## Flag

\`\`\`
flag{...}
\`\`\`

## Lessons learned

`,
  "Doc Projet": `# [Nom du projet]

## Overview

## Stack technique

\`\`\`
Frontend:
Backend:
Database:
Infra:
\`\`\`

## Architecture

## Features
- [ ] Feature 1
- [ ] Feature 2

## Setup

\`\`\`bash
# Installation
\`\`\`

## Notes

`,
  "Cours Guardia": `# [Matière] — [Chapitre]

**Date:** ${new Date().toLocaleDateString("fr-FR")}
**Prof:**
**Tags:** cours, guardia

---

## Objectifs du cours

## Concepts clés

## Points importants

## Exercices / TP

## Résumé

`,
  "Pentest Report": `# Rapport de Pentest — [Cible]

**Date:** ${new Date().toLocaleDateString("fr-FR")}
**Testeur:** Alessandro Gagliardi
**Scope:** 
**Méthodologie:** OWASP Testing Guide v4.2

---

## Executive Summary

## Vulnérabilités identifiées

| ID | Titre | Criticité | CVSS |
|----|-------|-----------|------|
| V1 | | Critique | 9.x |

## V1 — [Nom de la vulnérabilité]

**Criticité:** Critique / Haute / Moyenne / Faible
**CVSS:** 
**Composant affecté:**

### Description

### Preuve (PoC)

\`\`\`http
GET /vulnerable HTTP/1.1
\`\`\`

### Impact

### Recommandation

---

## Conclusion

`,
};

// ─── Utils ────────────────────────────────────────────────────────────────────

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

function extractTags(content: string): string[] {
  const tags: string[] = [];
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const m = fm[1].match(/tags:\s*\[([^\]]+)\]/);
    if (m) tags.push(...m[1].split(",").map(t => t.trim()));
  }
  const inlineRegex = /#([a-zA-Z][a-zA-Z0-9_-]*)/g;
  let inlineMatch;
  while ((inlineMatch = inlineRegex.exec(content)) !== null) {
    if (!tags.includes(inlineMatch[1])) tags.push(inlineMatch[1]);
  }
  return tags;
}

function extractHeadings(content: string): { level: number; text: string; id: string }[] {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const headings: { level: number; text: string; id: string }[] = [];
  let m;
  while ((m = headingRegex.exec(content)) !== null) {
    headings.push({ level: m[1].length, text: m[2], id: m[2].toLowerCase().replace(/[^a-z0-9]+/g, "-") });
  }
  return headings;
}

function wordCount(text: string) { return text.trim().split(/\s+/).filter(Boolean).length; }
function readTime(text: string) { return Math.max(1, Math.round(wordCount(text) / 200)); }

function highlight(text: string, query: string): string {
  if (!query) return text;
  return text.replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), m => `<mark>${m}</mark>`);
}

function insertMd(ref: React.RefObject<HTMLTextAreaElement>, before: string, after = "", ph = "") {
  const el = ref.current; if (!el) return;
  const s = el.selectionStart, e = el.selectionEnd;
  const sel = el.value.slice(s, e) || ph;
  el.value = el.value.slice(0, s) + before + sel + after + el.value.slice(e);
  el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function markdownToHtml(md: string, title: string) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${title}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#0d1117;color:#e6edf3;padding:3rem;max-width:860px;margin:auto;line-height:1.8}h1{font-size:2.2rem;font-weight:700;margin:2rem 0 1rem;border-bottom:1px solid #21262d;padding-bottom:.5rem}h2{font-size:1.6rem;font-weight:600;margin:1.5rem 0 .8rem}h3{font-size:1.2rem;color:#00d4ff;margin:1.2rem 0 .6rem}p{margin-bottom:1rem}code{background:#161b22;border:1px solid #21262d;padding:.2em .5em;border-radius:4px;font-family:monospace;font-size:.85em;color:#00d4ff}pre{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:1.5rem;overflow-x:auto;margin:1rem 0}pre code{background:none;border:none;color:#e6edf3}ul,ol{padding-left:1.5rem;margin-bottom:1rem}li{margin-bottom:.3rem}blockquote{border-left:3px solid #6e00ff;padding-left:1rem;color:#8b949e;font-style:italic;margin:1rem 0}a{color:#00d4ff}table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{border:1px solid #21262d;padding:.6rem 1rem}th{background:#161b22}strong{color:#fff;font-weight:600}hr{border:none;border-top:1px solid #21262d;margin:1.5rem 0}.meta{color:#8b949e;font-size:.85rem;margin-bottom:2rem;padding:.75rem;background:#161b22;border-radius:8px;border:1px solid #21262d}</style>
</head><body><div class="meta">📄 ${title} · Exporté depuis <strong>pazent.brain</strong> · ${new Date().toLocaleDateString("fr-FR", { year:"numeric",month:"long",day:"numeric" })}</div>${md}</body></html>`;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function AuthScreen({ onAuth }: { onAuth: (p: string) => void }) {
  const [pw, setPw] = useState("");
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#0d1117" }}>
      <div style={{ width:360 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:32 }}>
          <div style={{ width:40,height:40,borderRadius:10,background:"linear-gradient(135deg,#6e00ff,#00d4ff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20 }}>🧠</div>
          <div>
            <div style={{ fontWeight:700,fontSize:20,color:"#fff" }}>pazent.brain</div>
            <div style={{ fontSize:12,color:"#8b949e" }}>knowledge base privée</div>
          </div>
        </div>
        <div style={{ background:"#161b22",border:"1px solid #21262d",borderRadius:12,padding:24 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:16 }}>
            <Lock size={15} color="#6e00ff" />
            <span style={{ fontSize:14,fontWeight:500,color:"#e6edf3" }}>Accès protégé</span>
          </div>
          <input type="password" placeholder="Mot de passe" value={pw} onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === "Enter" && onAuth(pw)}
            style={{ width:"100%",padding:"10px 14px",background:"#0d1117",border:"1px solid #21262d",borderRadius:8,color:"#e6edf3",fontSize:14,outline:"none",marginBottom:12 }} autoFocus />
          <button onClick={() => onAuth(pw)}
            style={{ width:"100%",padding:"10px 14px",background:"linear-gradient(135deg,#6e00ff,#5500cc)",border:"none",borderRadius:8,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer" }}>
            Entrer →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shortcuts Modal ──────────────────────────────────────────────────────────

function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    ["Ctrl+S", "Sauvegarder"],
    ["Ctrl+P", "Basculer Preview"],
    ["Ctrl+D", "Mode Split"],
    ["F11", "Mode Focus"],
    ["Ctrl+F", "Recherche"],
    ["Ctrl+B", "Gras"],
    ["Ctrl+I", "Italique"],
    ["?", "Afficher raccourcis"],
    ["Esc", "Fermer / Quitter Focus"],
  ];
  return (
    <div style={{ position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:"#161b22",border:"1px solid #21262d",borderRadius:12,padding:24,minWidth:360 }} onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,fontWeight:600,fontSize:15,color:"#e6edf3" }}>
            <Keyboard size={16} color="#6e00ff" /> Raccourcis clavier
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:"#8b949e",cursor:"pointer" }}><X size={16}/></button>
        </div>
        {shortcuts.map(([key, desc]) => (
          <div key={key} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid #21262d22" }}>
            <span style={{ fontSize:13,color:"#8b949e" }}>{desc}</span>
            <kbd style={{ background:"#21262d",border:"1px solid #30363d",borderRadius:5,padding:"2px 8px",fontSize:12,color:"#e6edf3",fontFamily:"monospace" }}>{key}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── History Modal ────────────────────────────────────────────────────────────

function HistoryModal({ note, password, onRestore, onClose }: { note: Note; password: string; onRestore: (content: string) => void; onClose: () => void }) {
  const [commits, setCommits] = useState<{ sha: string; message: string; date: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/history?path=${encodeURIComponent(note.path)}`).then(r => r.json()).then(setCommits);
  }, [note.path]);

  async function loadVersion(sha: string) {
    setSelected(sha);
    const res = await fetch(`/api/file-at-commit?path=${encodeURIComponent(note.path)}&sha=${sha}`);
    const data = await res.json();
    setPreview(data.content || "");
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:"#161b22",border:"1px solid #21262d",borderRadius:12,width:700,maxHeight:"80vh",display:"flex",flexDirection:"column" }} onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:"1px solid #21262d" }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,fontWeight:600,color:"#e6edf3" }}>
            <History size={16} color="#6e00ff" /> Historique — {note.name}
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:"#8b949e",cursor:"pointer" }}><X size={16}/></button>
        </div>
        <div style={{ display:"flex",flex:1,overflow:"hidden" }}>
          <div style={{ width:220,borderRight:"1px solid #21262d",overflowY:"auto" }}>
            {commits.length === 0 && <div style={{ padding:16,color:"#8b949e",fontSize:13 }}>Chargement...</div>}
            {commits.map(c => (
              <button key={c.sha} onClick={() => loadVersion(c.sha)}
                style={{ display:"block",width:"100%",padding:"10px 14px",textAlign:"left",background: selected===c.sha ? "#6e00ff22" : "none",border:"none",borderBottom:"1px solid #21262d22",cursor:"pointer" }}>
                <div style={{ fontSize:12,color:"#e6edf3",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{c.message}</div>
                <div style={{ fontSize:11,color:"#8b949e" }}>{new Date(c.date).toLocaleDateString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
              </button>
            ))}
          </div>
          <div style={{ flex:1,padding:16,overflowY:"auto" }}>
            {preview === null ? (
              <div style={{ color:"#8b949e",fontSize:13,paddingTop:16 }}>← Sélectionne une version</div>
            ) : (
              <>
                <button onClick={() => { onRestore(preview); onClose(); }}
                  style={{ display:"flex",alignItems:"center",gap:6,marginBottom:12,padding:"6px 12px",background:"#6e00ff",border:"none",borderRadius:7,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer" }}>
                  <RefreshCw size={12} /> Restaurer cette version
                </button>
                <pre style={{ fontSize:12,color:"#8b949e",whiteSpace:"pre-wrap",lineHeight:1.6 }}>{preview}</pre>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Brain() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [active, setActive] = useState<Note | null>(null);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [viewMode, setViewMode] = useState<"edit" | "preview" | "split">("edit");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{ note: Note; excerpt: string }[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newNoteName, setNewNoteName] = useState("");
  const [newNoteFolder, setNewNoteFolder] = useState("notes");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["cybersec","projets","cours","ressources"]));
  const [favorites, setFavorites] = useState<string[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showDownload, setShowDownload] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const s = sessionStorage.getItem(PASSWORD_KEY);
    if (s) { setPassword(s); setAuthed(true); }
    const favs = localStorage.getItem(FAVS_KEY);
    if (favs) setFavorites(JSON.parse(favs));
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
    setPassword(pw); setAuthed(true);
  }

  async function openNote(note: Note) {
    const res = await fetch(`/api/notes?path=${encodeURIComponent(note.path)}`);
    const data = await res.json();
    setActive(data); setContent(data.content || ""); setOriginalContent(data.content || "");
    if (viewMode === "split") {} else setViewMode("edit");
    setShowDownload(false); setSearchResults(null); setSearch("");
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
    setActive(updated); setOriginalContent(content);
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  async function deleteNote() {
    if (!active || !confirm(`Supprimer "${active.name}" ?`)) return;
    setDeleting(true);
    await fetch("/api/notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-app-password": password },
      body: JSON.stringify({ path: active.path, sha: active.sha }),
    });
    setActive(null); setContent(""); setDeleting(false); fetchNotes();
  }

  async function createNote() {
    if (!newNoteName.trim()) return;
    const slug = newNoteName.trim().replace(/ /g, "-").toLowerCase();
    const path = `${newNoteFolder}/${slug}.md`;
    const initial = selectedTemplate ? TEMPLATES[selectedTemplate] : `# ${newNoteName.trim()}\n\n`;
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-password": password },
      body: JSON.stringify({ path, content: initial }),
    });
    setNewNoteName(""); setCreating(false); setSelectedTemplate("");
    await fetchNotes(); await openNote({ path, name: newNoteName.trim() });
  }

  function toggleFavorite(path: string) {
    const newFavs = favorites.includes(path) ? favorites.filter(f => f !== path) : [...favorites, path];
    setFavorites(newFavs); localStorage.setItem(FAVS_KEY, JSON.stringify(newFavs));
  }

  async function searchNotes(query: string) {
    if (!query.trim()) { setSearchResults(null); return; }
    const results: { note: Note; excerpt: string }[] = [];
    for (const note of notes) {
      if (note.name.toLowerCase().includes(query.toLowerCase())) {
        results.push({ note, excerpt: `📄 ${note.name}` }); continue;
      }
      try {
        const res = await fetch(`/api/notes?path=${encodeURIComponent(note.path)}`);
        const data = await res.json();
        if (data.content?.toLowerCase().includes(query.toLowerCase())) {
          const idx = data.content.toLowerCase().indexOf(query.toLowerCase());
          const start = Math.max(0, idx - 60);
          const excerpt = "..." + data.content.slice(start, idx + query.length + 60) + "...";
          results.push({ note, excerpt });
        }
      } catch {}
    }
    setSearchResults(results);
  }

  function downloadMd() { if (!active) return; const b = new Blob([content],{type:"text/markdown"}); const a = document.createElement("a"); a.href=URL.createObjectURL(b); a.download=`${active.name}.md`; a.click(); }
  function downloadHtml() { if (!active) return; const b = new Blob([markdownToHtml(content,active.name)],{type:"text/html"}); const a = document.createElement("a"); a.href=URL.createObjectURL(b); a.download=`${active.name}.html`; a.click(); }
  function downloadTxt() { if (!active) return; const b = new Blob([content],{type:"text/plain"}); const a = document.createElement("a"); a.href=URL.createObjectURL(b); a.download=`${active.name}.txt`; a.click(); }
  function printPdf() { if (!active) return; const w = window.open("","_blank"); if(!w) return; w.document.write(markdownToHtml(content,active.name)); w.document.close(); w.onload=()=>w.print(); }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey||e.metaKey) && e.key==="s") { e.preventDefault(); saveNote(); }
      if ((e.ctrlKey||e.metaKey) && e.key==="p") { e.preventDefault(); setViewMode(v => v==="preview" ? "edit" : "preview"); }
      if ((e.ctrlKey||e.metaKey) && e.key==="d") { e.preventDefault(); setViewMode(v => v==="split" ? "edit" : "split"); }
      if (e.key==="F11") { e.preventDefault(); setFocusMode(v => !v); }
      if (e.key==="Escape") { setShowDownload(false); setCreating(false); setShowHistory(false); setShowShortcuts(false); if(focusMode) setFocusMode(false); }
      if (e.key==="?" && !["INPUT","TEXTAREA"].includes((e.target as Element).tagName)) setShowShortcuts(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const isDirty = content !== originalContent;
  const tree = buildTree(notes);
  const folders = Object.keys(tree.subfolders);
  const allTags = [...new Set(notes.flatMap(n => extractTags(n.content || "")))];
  const favNotes = notes.filter(n => favorites.includes(n.path));
  const headings = active ? extractHeadings(content) : [];

  const displayNotes = searchResults !== null
    ? searchResults.map(r => r.note)
    : activeTag
      ? notes.filter(n => extractTags(n.content || "").includes(activeTag))
      : null;

  if (loading) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0d1117",color:"#8b949e",fontSize:14 }}>chargement...</div>;
  if (!authed) return <AuthScreen onAuth={handleAuth} />;

  return (
    <div style={{ display:"flex",height:"100vh",background:"#0d1117",color:"#e6edf3",fontFamily:"'Inter',sans-serif",overflow:"hidden" }}>

      {/* Sidebar */}
      {!focusMode && (
        <aside style={{ width:260,minWidth:260,background:"#0d1117",borderRight:"1px solid #21262d",display:"flex",flexDirection:"column",overflow:"hidden" }}>

          {/* Logo */}
          <div style={{ padding:"16px 16px 12px",borderBottom:"1px solid #21262d" }}>
            <div style={{ display:"flex",alignItems:"center",gap:10 }}>
              <div style={{ width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#6e00ff,#00d4ff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>🧠</div>
              <div>
                <div style={{ fontWeight:700,fontSize:14,color:"#fff",letterSpacing:"-0.3px" }}>pazent.brain</div>
                <div style={{ fontSize:11,color:"#8b949e" }}>{notes.length} notes</div>
              </div>
              <button onClick={fetchNotes} style={{ marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"#8b949e",padding:4,borderRadius:4 }}>
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div style={{ padding:"10px 12px 4px" }}>
            <div style={{ display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"#161b22",border:"1px solid #21262d",borderRadius:8 }}>
              <Search size={13} color="#8b949e" />
              <input value={search} onChange={e => { setSearch(e.target.value); if (!e.target.value) { setSearchResults(null); } }}
                onKeyDown={e => e.key==="Enter" && searchNotes(search)}
                placeholder="Recherche (Entrée = full-text)"
                style={{ background:"none",border:"none",outline:"none",color:"#e6edf3",fontSize:13,width:"100%" }} />
              {search && <button onClick={() => { setSearch(""); setSearchResults(null); }} style={{ background:"none",border:"none",cursor:"pointer",color:"#8b949e",padding:0 }}><X size={12}/></button>}
            </div>
          </div>

          {/* New note */}
          <div style={{ padding:"4px 12px 8px" }}>
            {creating ? (
              <div style={{ background:"#161b22",border:"1px solid #6e00ff44",borderRadius:8,padding:10 }}>
                <input value={newNoteName} onChange={e => setNewNoteName(e.target.value)} onKeyDown={e => e.key==="Enter" && createNote()}
                  placeholder="Nom de la note..." autoFocus
                  style={{ width:"100%",background:"none",border:"none",outline:"none",color:"#e6edf3",fontSize:13,marginBottom:8 }} />
                <select value={newNoteFolder} onChange={e => setNewNoteFolder(e.target.value)}
                  style={{ width:"100%",background:"#0d1117",border:"1px solid #21262d",borderRadius:6,color:"#8b949e",fontSize:12,padding:"4px 8px",marginBottom:8,outline:"none" }}>
                  <option value="notes">📄 Racine</option>
                  {folders.map(f => <option key={f} value={`notes/${f}`}>📁 {f}</option>)}
                  <option value="notes/nouveau-dossier">➕ Nouveau dossier...</option>
                </select>
                <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}
                  style={{ width:"100%",background:"#0d1117",border:"1px solid #21262d",borderRadius:6,color:"#8b949e",fontSize:12,padding:"4px 8px",marginBottom:8,outline:"none" }}>
                  <option value="">Pas de template</option>
                  {Object.keys(TEMPLATES).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div style={{ display:"flex",gap:6 }}>
                  <button onClick={createNote} style={{ flex:1,padding:"6px 0",background:"#6e00ff",border:"none",borderRadius:6,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer" }}>Créer</button>
                  <button onClick={() => setCreating(false)} style={{ padding:"6px 10px",background:"#21262d",border:"none",borderRadius:6,color:"#8b949e",fontSize:12,cursor:"pointer" }}>✕</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setCreating(true)}
                style={{ display:"flex",alignItems:"center",gap:8,width:"100%",padding:"7px 10px",background:"none",border:"1px dashed #21262d",borderRadius:8,color:"#8b949e",fontSize:13,cursor:"pointer" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor="#6e00ff44"; e.currentTarget.style.color="#6e00ff"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor="#21262d"; e.currentTarget.style.color="#8b949e"; }}>
                <Plus size={13} /> Nouvelle note
              </button>
            )}
          </div>

          {/* Notes list */}
          <nav style={{ flex:1,overflowY:"auto",padding:"4px 8px 8px" }}>

            {/* Search results */}
            {searchResults !== null ? (
              <div>
                <div style={{ padding:"4px 8px",fontSize:11,color:"#8b949e",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4 }}>{searchResults.length} résultat{searchResults.length!==1?"s":""}</div>
                {searchResults.map(r => (
                  <div key={r.note.path}>
                    <NoteRow note={r.note} active={active} favorites={favorites} onToggleFav={toggleFavorite} onClick={() => openNote(r.note)} />
                    <div style={{ fontSize:11,color:"#8b949e",padding:"0 8px 6px 28px",lineHeight:1.4 }} dangerouslySetInnerHTML={{ __html: highlight(r.excerpt.slice(0,120), search) }} />
                  </div>
                ))}
              </div>
            ) : activeTag ? (
              <div>
                <div style={{ display:"flex",alignItems:"center",gap:6,padding:"4px 8px",fontSize:11,color:"#6e00ff",fontWeight:600,marginBottom:4 }}>
                  <Tag size={11}/> #{activeTag} <button onClick={() => setActiveTag(null)} style={{ background:"none",border:"none",color:"#8b949e",cursor:"pointer",fontSize:11,marginLeft:"auto" }}>✕</button>
                </div>
                {(displayNotes||[]).map(n => <NoteRow key={n.path} note={n} active={active} favorites={favorites} onToggleFav={toggleFavorite} onClick={() => openNote(n)} />)}
              </div>
            ) : (
              <>
                {/* Favorites */}
                {favNotes.length > 0 && (
                  <div style={{ marginBottom:8 }}>
                    <div style={{ padding:"4px 8px",fontSize:11,color:"#8b949e",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2 }}>⭐ Favoris</div>
                    {favNotes.map(n => <NoteRow key={n.path} note={n} active={active} favorites={favorites} onToggleFav={toggleFavorite} onClick={() => openNote(n)} />)}
                    <div style={{ height:1,background:"#21262d",margin:"8px 0" }} />
                  </div>
                )}
                {/* Root notes */}
                {tree.notes.map(n => <NoteRow key={n.path} note={n} active={active} favorites={favorites} onToggleFav={toggleFavorite} onClick={() => openNote(n)} />)}
                {/* Folders */}
                {folders.map(folder => (
                  <div key={folder} style={{ marginTop:4 }}>
                    <div style={{ display:"flex",alignItems:"center" }}>
                      <button onClick={() => setExpandedFolders(prev => { const s=new Set(prev); s.has(folder)?s.delete(folder):s.add(folder); return s; })}
                        style={{ display:"flex",alignItems:"center",gap:6,flex:1,padding:"5px 8px",background:"none",border:"none",color:"#8b949e",fontSize:12,fontWeight:600,cursor:"pointer",borderRadius:6,textTransform:"uppercase",letterSpacing:"0.5px" }}
                        onMouseEnter={e => (e.currentTarget.style.background="#161b22")}
                        onMouseLeave={e => (e.currentTarget.style.background="none")}>
                        {expandedFolders.has(folder) ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                        {expandedFolders.has(folder) ? <FolderOpen size={12}/> : <Folder size={12}/>}
                        {folder}
                        <span style={{ marginLeft:"auto",fontSize:10,opacity:.6 }}>{tree.subfolders[folder].notes.length}</span>
                      </button>
                      <button onClick={() => { setNewNoteFolder(`notes/${folder}`); setCreating(true); }}
                        style={{ padding:"3px 5px",background:"none",border:"none",color:"#8b949e",cursor:"pointer",borderRadius:4,opacity:.5 }}
                        onMouseEnter={e => (e.currentTarget.style.opacity="1")} onMouseLeave={e => (e.currentTarget.style.opacity=".5")}>
                        <Plus size={11}/>
                      </button>
                    </div>
                    {expandedFolders.has(folder) && (
                      <div style={{ paddingLeft:12 }}>
                        {tree.subfolders[folder].notes.map(n => <NoteRow key={n.path} note={n} active={active} favorites={favorites} onToggleFav={toggleFavorite} onClick={() => openNote(n)} />)}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </nav>

          {/* Tags */}
          {allTags.length > 0 && (
            <div style={{ padding:"8px 12px",borderTop:"1px solid #21262d" }}>
              <div style={{ fontSize:11,color:"#8b949e",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,display:"flex",alignItems:"center",gap:6 }}>
                <Tag size={11}/> Tags
              </div>
              <div style={{ display:"flex",flexWrap:"wrap",gap:4 }}>
                {allTags.map(tag => (
                  <button key={tag} onClick={() => setActiveTag(activeTag===tag ? null : tag)}
                    style={{ padding:"2px 8px",borderRadius:20,fontSize:11,cursor:"pointer",border:"none",background: activeTag===tag ? "#6e00ff" : "#21262d",color: activeTag===tag ? "#fff" : "#8b949e" }}>
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Shortcuts hint */}
          <div style={{ padding:"6px 12px",borderTop:"1px solid #21262d",fontSize:11,color:"#8b949e",display:"flex",alignItems:"center",gap:6,cursor:"pointer" }} onClick={() => setShowShortcuts(true)}>
            <Keyboard size={11}/> <span>Raccourcis clavier</span> <kbd style={{ marginLeft:"auto",background:"#21262d",border:"1px solid #30363d",borderRadius:3,padding:"1px 5px",fontSize:10 }}>?</kbd>
          </div>
        </aside>
      )}

      {/* Main */}
      <main style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative" }}>

        {/* Topbar */}
        {!focusMode && (
          <div style={{ display:"flex",alignItems:"center",gap:8,padding:"0 16px",height:48,borderBottom:"1px solid #21262d",background:"#0d1117",flexShrink:0 }}>
            {active ? (
              <>
                {/* Breadcrumb */}
                <div style={{ display:"flex",alignItems:"center",gap:6,fontSize:13,color:"#8b949e",flex:1,minWidth:0,overflow:"hidden" }}>
                  <span>notes</span>
                  {active.path.includes("/",6) && (<><ChevronRight size={12}/><span>{active.path.replace(/^notes\//,"").split("/")[0]}</span></>)}
                  <ChevronRight size={12}/>
                  <span style={{ color:"#e6edf3",fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{active.name}</span>
                  {isDirty && <span style={{ width:6,height:6,borderRadius:"50%",background:"#6e00ff",flexShrink:0 }}/>}
                </div>
                {/* Stats */}
                <div style={{ display:"flex",alignItems:"center",gap:10,fontSize:12,color:"#8b949e",flexShrink:0 }}>
                  <span style={{ display:"flex",alignItems:"center",gap:4 }}><AlignLeft size={11}/> {wordCount(content)}</span>
                  <span style={{ display:"flex",alignItems:"center",gap:4 }}><Clock size={11}/> {readTime(content)} min</span>
                </div>
                {/* Actions */}
                <div style={{ display:"flex",alignItems:"center",gap:3,flexShrink:0 }}>
                  {/* View mode */}
                  <div style={{ display:"flex",background:"#161b22",border:"1px solid #21262d",borderRadius:7,overflow:"hidden" }}>
                    {(["edit","split","preview"] as const).map(mode => (
                      <button key={mode} onClick={() => setViewMode(mode)}
                        style={{ padding:"5px 10px",background: viewMode===mode ? "#6e00ff22" : "none",border:"none",color: viewMode===mode ? "#6e00ff" : "#8b949e",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:5 }}>
                        {mode==="edit" && <><Edit3 size={12}/> Éditer</>}
                        {mode==="split" && <><Columns size={12}/> Split</>}
                        {mode==="preview" && <><Eye size={12}/> Preview</>}
                      </button>
                    ))}
                  </div>

                  {/* TOC */}
                  {headings.length > 0 && (
                    <button onClick={() => setShowTOC(!showTOC)}
                      style={{ padding:"5px 8px",background: showTOC ? "#6e00ff22" : "#161b22",border:`1px solid ${showTOC?"#6e00ff44":"#21262d"}`,borderRadius:7,color: showTOC ? "#6e00ff" : "#8b949e",cursor:"pointer" }} title="Table des matières">
                      <ListIcon size={13}/>
                    </button>
                  )}

                  {/* History */}
                  <button onClick={() => setShowHistory(true)}
                    style={{ padding:"5px 8px",background:"#161b22",border:"1px solid #21262d",borderRadius:7,color:"#8b949e",cursor:"pointer" }} title="Historique">
                    <History size={13}/>
                  </button>

                  {/* Focus */}
                  <button onClick={() => setFocusMode(true)}
                    style={{ padding:"5px 8px",background:"#161b22",border:"1px solid #21262d",borderRadius:7,color:"#8b949e",cursor:"pointer" }} title="Mode focus (F11)">
                    <Maximize2 size={13}/>
                  </button>

                  {/* Download */}
                  <div style={{ position:"relative" }}>
                    <button onClick={() => setShowDownload(!showDownload)}
                      style={{ display:"flex",alignItems:"center",gap:5,padding:"5px 10px",background:"#161b22",border:"1px solid #21262d",borderRadius:7,color:"#8b949e",fontSize:12,cursor:"pointer" }}>
                      <Download size={13}/> Exporter
                    </button>
                    {showDownload && (
                      <div style={{ position:"absolute",top:"calc(100% + 6px)",right:0,background:"#161b22",border:"1px solid #21262d",borderRadius:10,padding:6,zIndex:100,minWidth:170,boxShadow:"0 8px 32px #00000066" }}>
                        {[
                          { icon:<FileDown size={13}/>, label:"Markdown (.md)", fn:downloadMd },
                          { icon:<Code size={13}/>, label:"HTML (.html)", fn:downloadHtml },
                          { icon:<Hash size={13}/>, label:"Texte brut (.txt)", fn:downloadTxt },
                          { icon:<FileText size={13}/>, label:"PDF (imprimer)", fn:printPdf },
                        ].map(({icon,label,fn}) => (
                          <button key={label} onClick={() => { fn(); setShowDownload(false); }}
                            style={{ display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 12px",background:"none",border:"none",borderRadius:7,color:"#e6edf3",fontSize:13,cursor:"pointer",textAlign:"left" }}
                            onMouseEnter={e => (e.currentTarget.style.background="#21262d")}
                            onMouseLeave={e => (e.currentTarget.style.background="none")}>
                            <span style={{ color:"#8b949e" }}>{icon}</span> {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Save */}
                  <button onClick={saveNote} disabled={saving||!isDirty}
                    style={{ display:"flex",alignItems:"center",gap:5,padding:"5px 12px",background: saved ? "#00d4ff22" : isDirty ? "#6e00ff" : "#161b22",border:`1px solid ${saved?"#00d4ff44":isDirty?"transparent":"#21262d"}`,borderRadius:7,color: saved ? "#00d4ff" : isDirty ? "#fff" : "#8b949e",fontSize:12,fontWeight:600,cursor: isDirty ? "pointer" : "default",opacity: saving ? .6 : 1 }}>
                    {saved ? <Check size={13}/> : <Save size={13}/>}
                    {saved ? "Sauvegardé" : saving ? "..." : "Sauvegarder"}
                  </button>

                  <button onClick={deleteNote} disabled={deleting}
                    style={{ padding:"5px 8px",background:"none",border:"1px solid #21262d",borderRadius:7,color:"#8b949e",cursor:"pointer" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor="#ff444444"; e.currentTarget.style.color="#ff4444"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor="#21262d"; e.currentTarget.style.color="#8b949e"; }}>
                    <Trash2 size={13}/>
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display:"flex",alignItems:"center",gap:8,fontSize:13,color:"#8b949e" }}>
                <span>← Sélectionne ou crée une note</span>
              </div>
            )}
          </div>
        )}

        {/* Focus mode exit bar */}
        {focusMode && (
          <div style={{ position:"fixed",top:0,left:0,right:0,height:3,background:"linear-gradient(90deg,#6e00ff,#00d4ff)",zIndex:100 }} />
        )}

        {/* Markdown toolbar */}
        {active && viewMode==="edit" && !focusMode && (
          <div style={{ display:"flex",alignItems:"center",gap:2,padding:"4px 16px",borderBottom:"1px solid #21262d",background:"#0d1117",flexShrink:0 }}>
            {[
              { icon:<Bold size={13}/>, before:"**",after:"**",ph:"gras" },
              { icon:<Italic size={13}/>, before:"*",after:"*",ph:"italique" },
              { icon:<Hash size={13}/>, before:"# ",after:"",ph:"titre" },
              { icon:<ListIcon size={13}/>, before:"- ",after:"",ph:"item" },
              { icon:<Link2 size={13}/>, before:"[",after:"](url)",ph:"lien" },
              { icon:<Code size={13}/>, before:"```\n",after:"\n```",ph:"code" },
            ].map(({icon,before,after,ph},i) => (
              <button key={i} onClick={() => insertMd(textareaRef,before,after,ph)}
                style={{ padding:"3px 7px",background:"none",border:"none",borderRadius:5,color:"#8b949e",cursor:"pointer" }}
                onMouseEnter={e => (e.currentTarget.style.background="#161b22")}
                onMouseLeave={e => (e.currentTarget.style.background="none")}>
                {icon}
              </button>
            ))}
            {focusMode && (
              <button onClick={() => setFocusMode(false)} style={{ marginLeft:"auto",padding:"3px 10px",background:"none",border:"1px solid #21262d",borderRadius:5,color:"#8b949e",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:5 }}>
                <Minimize2 size={12}/> Quitter focus
              </button>
            )}
          </div>
        )}

        {/* Content area */}
        <div style={{ flex:1,overflow:"hidden",display:"flex" }}>
          {!active ? (
            <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,color:"#8b949e" }}>
              <div style={{ width:64,height:64,borderRadius:16,background:"linear-gradient(135deg,#6e00ff11,#00d4ff11)",border:"1px solid #21262d",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28 }}>🧠</div>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:15,fontWeight:500,color:"#e6edf3",marginBottom:6 }}>Aucune note sélectionnée</div>
                <div style={{ fontSize:13,color:"#8b949e" }}>Sélectionne une note ou crée-en une nouvelle</div>
              </div>
              <button onClick={() => setCreating(true)} style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 16px",background:"#6e00ff",border:"none",borderRadius:8,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer" }}>
                <Plus size={14}/> Nouvelle note
              </button>
            </div>
          ) : (
            <>
              {/* Editor */}
              {(viewMode==="edit" || viewMode==="split") && (
                <div style={{ flex:1,overflow:"hidden",borderRight: viewMode==="split" ? "1px solid #21262d" : "none" }}>
                  <textarea ref={textareaRef} value={content} onChange={e => setContent(e.target.value)}
                    style={{ width:"100%",height:"100%",padding: focusMode ? "60px 80px" : "32px 48px",background:"#0d1117",color:"#e6edf3",border:"none",outline:"none",resize:"none",fontFamily:"'JetBrains Mono',monospace",fontSize:14,lineHeight:1.9,caretColor:"#00d4ff" }}
                    placeholder="Commence à écrire en Markdown..." spellCheck={false} />
                </div>
              )}
              {/* Preview */}
              {(viewMode==="preview" || viewMode==="split") && (
                <div style={{ flex:1,overflowY:"auto",padding: focusMode ? "60px 80px" : "32px 48px" }} id="preview-panel">
                  <article className="prose" style={{ maxWidth:760,margin:"0 auto" }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                      {content}
                    </ReactMarkdown>
                  </article>
                </div>
              )}
              {/* TOC panel */}
              {showTOC && headings.length > 0 && (
                <div style={{ width:200,borderLeft:"1px solid #21262d",padding:"16px 12px",overflowY:"auto",background:"#0d1117" }}>
                  <div style={{ fontSize:11,fontWeight:600,color:"#8b949e",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10,display:"flex",alignItems:"center",gap:6 }}>
                    <ListIcon size={11}/> Sommaire
                    <button onClick={() => setShowTOC(false)} style={{ marginLeft:"auto",background:"none",border:"none",color:"#8b949e",cursor:"pointer" }}><X size={11}/></button>
                  </div>
                  {headings.map((h, i) => (
                    <button key={i} onClick={() => {
                      const el = document.getElementById(h.id);
                      if (el) el.scrollIntoView({ behavior:"smooth" });
                    }}
                      style={{ display:"block",width:"100%",textAlign:"left",padding:`3px ${(h.level-1)*10}px`,background:"none",border:"none",color: h.level===1 ? "#e6edf3" : h.level===2 ? "#c9d1d9" : "#8b949e",fontSize: h.level===1 ? 13 : h.level===2 ? 12 : 11,cursor:"pointer",lineHeight:1.4,marginBottom:2,borderRadius:4 }}
                      onMouseEnter={e => (e.currentTarget.style.color="#6e00ff")}
                      onMouseLeave={e => (e.currentTarget.style.color=h.level===1?"#e6edf3":h.level===2?"#c9d1d9":"#8b949e")}>
                      {h.text}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Focus mode: minimal save button */}
        {focusMode && active && (
          <div style={{ position:"fixed",bottom:24,right:24,display:"flex",gap:8,zIndex:200 }}>
            <button onClick={() => setFocusMode(false)}
              style={{ padding:"8px 12px",background:"#161b22",border:"1px solid #21262d",borderRadius:8,color:"#8b949e",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13 }}>
              <Minimize2 size={14}/> Quitter
            </button>
            <button onClick={saveNote} disabled={saving||!isDirty}
              style={{ padding:"8px 16px",background: isDirty ? "#6e00ff" : "#161b22",border:"none",borderRadius:8,color: isDirty ? "#fff" : "#8b949e",cursor: isDirty ? "pointer" : "default",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6 }}>
              <Save size={14}/> {saved ? "Sauvegardé ✓" : "Sauvegarder"}
            </button>
          </div>
        )}
      </main>

      {/* Modals */}
      {showHistory && active && <HistoryModal note={active} password={password} onRestore={c => { setContent(c); setShowHistory(false); }} onClose={() => setShowHistory(false)} />}
      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
      {showDownload && <div onClick={() => setShowDownload(false)} style={{ position:"fixed",inset:0,zIndex:50 }} />}
    </div>
  );
}

function NoteRow({ note, active, favorites, onToggleFav, onClick }: { note: Note; active: Note | null; favorites: string[]; onToggleFav: (p: string) => void; onClick: () => void }) {
  const isActive = active?.path === note.path;
  const isFav = favorites.includes(note.path);
  const name = note.path.split("/").pop()?.replace(".md","") || note.name;
  return (
    <div style={{ display:"flex",alignItems:"center",gap:0,marginBottom:1 }}>
      <button onClick={onClick} style={{ display:"flex",alignItems:"center",gap:7,flex:1,padding:"5px 8px",background: isActive ? "#6e00ff18" : "none",border:`1px solid ${isActive?"#6e00ff33":"transparent"}`,borderRadius:7,color: isActive ? "#a78bfa" : "#c9d1d9",fontSize:13,cursor:"pointer",textAlign:"left",minWidth:0 }}
        onMouseEnter={e => { if(!isActive) e.currentTarget.style.background="#161b22"; }}
        onMouseLeave={e => { if(!isActive) e.currentTarget.style.background="none"; }}>
        <FileText size={12} color={isActive ? "#6e00ff" : "#8b949e"} style={{ flexShrink:0 }}/>
        <span style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1 }}>{name}</span>
      </button>
      <button onClick={e => { e.stopPropagation(); onToggleFav(note.path); }}
        style={{ padding:"4px 5px",background:"none",border:"none",cursor:"pointer",color: isFav ? "#f0b429" : "#8b949e",opacity: isFav ? 1 : 0,flexShrink:0 }}
        onMouseEnter={e => (e.currentTarget.style.opacity="1")}
        onMouseLeave={e => (e.currentTarget.style.opacity=isFav?"1":"0")}>
        <Star size={11} fill={isFav?"#f0b429":"none"}/>
      </button>
    </div>
  );
}
