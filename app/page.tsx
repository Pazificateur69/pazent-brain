"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  FileText, FolderOpen, Folder, Plus, Search, Save, Trash2, Eye, Edit3,
  ChevronRight, ChevronDown, Download, FileDown, Code, Hash,
  AlignLeft, Clock, Bold, Italic, Link2, X, Check, Star,
  RefreshCw, Columns, Maximize2, Minimize2, History, Tag,
  List as ListIcon, Keyboard, Lock, BarChart2, Zap, ExternalLink, RotateCcw
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface Note { path: string; name: string; content?: string; sha?: string; }
interface FolderNode { name: string; notes: Note[]; subfolders: Record<string, FolderNode>; }

const PASSWORD_KEY = "pazent_brain_auth";
const FAVS_KEY = "pazent_brain_favs";
const THEME_KEY = "pazent_brain_theme";

// ─── Theme ───────────────────────────────────────────────────────────────────

interface Theme {
  bg: string; surface: string; surface2: string; border: string;
  text: string; muted: string; accent: string; accentBg: string;
  editorBg: string; inputBg: string; hoverBg: string;
}

const DARK: Theme = {
  bg: "#0d1117", surface: "#161b22", surface2: "#1c2128", border: "#21262d",
  text: "#e6edf3", muted: "#8b949e", accent: "#6e00ff", accentBg: "#6e00ff18",
  editorBg: "#0d1117", inputBg: "#161b22", hoverBg: "#161b22"
};

const LIGHT: Theme = {
  bg: "#f6f8fa", surface: "#ffffff", surface2: "#f3f4f6", border: "#d0d7de",
  text: "#1f2328", muted: "#57606a", accent: "#6e00ff", accentBg: "#6e00ff12",
  editorBg: "#ffffff", inputBg: "#f6f8fa", hoverBg: "#f3f4f6"
};

// ─── Templates ───────────────────────────────────────────────────────────────

const TEMPLATES: Record<string, string> = {
  "Writeup CTF": `# Writeup — [Nom du challenge]

**Plateforme:** HackTheBox / TryHackMe
**Catégorie:** Web / Pwn / Crypto / Forensics
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

**Stack:** 
**Date:** ${new Date().toLocaleDateString("fr-FR")}
**Tags:** projet

---

## Overview

## Architecture

\`\`\`
Frontend:
Backend:
Database:
\`\`\`

## Features
- [ ] Feature 1
- [ ] Feature 2

## Setup

\`\`\`bash
# Installation
\`\`\`
`,
  "Cours Guardia": `# [Matière] — [Chapitre]

**Date:** ${new Date().toLocaleDateString("fr-FR")}
**Prof:** 
**Tags:** cours, guardia

---

## Objectifs

## Concepts clés

## Points importants

## Exercices / TP

## Résumé
`,
  "Pentest Report": `# Rapport Pentest — [Cible]

**Date:** ${new Date().toLocaleDateString("fr-FR")}
**Testeur:** Alessandro Gagliardi
**Scope:** 
**Méthodologie:** OWASP Testing Guide v4.2

---

## Executive Summary

## Vulnérabilités

| ID | Titre | Criticité | CVSS |
|----|-------|-----------|------|
| V1 | | Critique | 9.x |

## V1 — [Titre]

**Criticité:** Critique  
**CVSS:**  
**Composant:**  

### Description

### Proof of Concept

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
    if (note.path.includes("_trash")) continue;
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
    if (m) tags.push(...m[1].split(",").map((t: string) => t.trim()));
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

function processWikiLinks(content: string, notes: Note[], onNavigate: (note: Note) => void): string {
  return content.replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
    return `**[[${name}]]**`;
  });
}

function wordCount(text: string) { return text.trim().split(/\s+/).filter(Boolean).length; }
function readTime(text: string) { return Math.max(1, Math.round(wordCount(text) / 200)); }

function highlightText(text: string, query: string): string {
  if (!query) return text;
  return text.replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), m => `<mark style="background:#6e00ff44;color:inherit;border-radius:2px">${m}</mark>`);
}

function insertMd(ref: React.RefObject<HTMLTextAreaElement>, before: string, after = "", ph = "") {
  const el = ref.current; if (!el) return;
  const s = el.selectionStart, e = el.selectionEnd;
  const sel = el.value.slice(s, e) || ph;
  el.value = el.value.slice(0, s) + before + sel + after + el.value.slice(e);
  el.focus(); el.setSelectionRange(s + before.length, s + before.length + sel.length);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function markdownToHtml(md: string, title: string, dark: boolean) {
  const bg = dark ? "#0d1117" : "#ffffff";
  const color = dark ? "#e6edf3" : "#1f2328";
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${title}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:${bg};color:${color};padding:3rem;max-width:860px;margin:auto;line-height:1.8}
h1{font-size:2.2rem;font-weight:700;margin:2rem 0 1rem;border-bottom:1px solid #21262d;padding-bottom:.5rem}
h2{font-size:1.6rem;font-weight:600;margin:1.5rem 0 .8rem}
h3{font-size:1.2rem;color:#00d4ff;margin:1.2rem 0 .6rem}
p{margin-bottom:1rem}code{background:#161b22;border:1px solid #21262d;padding:.2em .5em;border-radius:4px;font-family:monospace;font-size:.85em;color:#00d4ff}
pre{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:1.5rem;overflow-x:auto;margin:1rem 0}
pre code{background:none;border:none;color:${color}}ul,ol{padding-left:1.5rem;margin-bottom:1rem}
li{margin-bottom:.3rem}blockquote{border-left:3px solid #6e00ff;padding-left:1rem;color:#8b949e;font-style:italic;margin:1rem 0}
a{color:#00d4ff}table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{border:1px solid #21262d;padding:.6rem 1rem}
th{background:#161b22}strong{font-weight:600}hr{border:none;border-top:1px solid #21262d;margin:1.5rem 0}
.meta{color:#8b949e;font-size:.85rem;margin-bottom:2rem;padding:.75rem;background:#161b22;border-radius:8px;border:1px solid #21262d}
</style></head><body>
<div class="meta">📄 ${title} · Exporté depuis <strong>pazent.brain</strong> · ${new Date().toLocaleDateString("fr-FR", { year:"numeric",month:"long",day:"numeric" })}</div>
${md}
</body></html>`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
            onKeyDown={e => e.key==="Enter" && onAuth(pw)}
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

function ShortcutsModal({ t, onClose }: { t: Theme; onClose: () => void }) {
  const shorts = [
    ["Ctrl+S", "Sauvegarder"], ["Ctrl+P", "Toggle Preview"], ["Ctrl+D", "Mode Split"],
    ["F11", "Mode Focus"], ["Ctrl+K", "Quick capture"], ["Ctrl+B", "Gras"],
    ["Ctrl+I", "Italique"], ["?", "Raccourcis"], ["Esc", "Fermer / Quitter Focus"],
  ];
  return (
    <div style={{ position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:24,minWidth:360 }} onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,fontWeight:600,fontSize:15,color:t.text }}>
            <Keyboard size={16} color={t.accent} /> Raccourcis
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:t.muted,cursor:"pointer" }}><X size={16}/></button>
        </div>
        {shorts.map(([key, desc]) => (
          <div key={key} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${t.border}22` }}>
            <span style={{ fontSize:13,color:t.muted }}>{desc}</span>
            <kbd style={{ background:t.surface2,border:`1px solid ${t.border}`,borderRadius:5,padding:"2px 8px",fontSize:12,color:t.text,fontFamily:"monospace" }}>{key}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryModal({ note, t, onRestore, onClose }: { note: Note; t: Theme; onRestore: (c: string) => void; onClose: () => void }) {
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
      <div style={{ background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,width:700,maxHeight:"80vh",display:"flex",flexDirection:"column" }} onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:`1px solid ${t.border}` }}>
          <div style={{ display:"flex",alignItems:"center",gap:8,fontWeight:600,color:t.text }}>
            <History size={16} color={t.accent} /> Historique — {note.name}
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:t.muted,cursor:"pointer" }}><X size={16}/></button>
        </div>
        <div style={{ display:"flex",flex:1,overflow:"hidden" }}>
          <div style={{ width:220,borderRight:`1px solid ${t.border}`,overflowY:"auto" }}>
            {commits.length===0 && <div style={{ padding:16,color:t.muted,fontSize:13 }}>Chargement...</div>}
            {commits.map(c => (
              <button key={c.sha} onClick={() => loadVersion(c.sha)}
                style={{ display:"block",width:"100%",padding:"10px 14px",textAlign:"left",background:selected===c.sha?t.accentBg:"none",border:"none",borderBottom:`1px solid ${t.border}22`,cursor:"pointer" }}>
                <div style={{ fontSize:12,color:t.text,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{c.message}</div>
                <div style={{ fontSize:11,color:t.muted }}>{new Date(c.date).toLocaleDateString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
              </button>
            ))}
          </div>
          <div style={{ flex:1,padding:16,overflowY:"auto" }}>
            {preview===null ? (
              <div style={{ color:t.muted,fontSize:13,paddingTop:16 }}>← Sélectionne une version</div>
            ) : (
              <>
                <button onClick={() => { onRestore(preview); onClose(); }}
                  style={{ display:"flex",alignItems:"center",gap:6,marginBottom:12,padding:"6px 12px",background:t.accent,border:"none",borderRadius:7,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer" }}>
                  <RotateCcw size={12}/> Restaurer
                </button>
                <pre style={{ fontSize:12,color:t.muted,whiteSpace:"pre-wrap",lineHeight:1.6 }}>{preview}</pre>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickCapture({ t, folders, password, onCreated, onClose }: { t: Theme; folders: string[]; password: string; onCreated: (note: Note) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [folder, setFolder] = useState("notes");

  async function capture() {
    if (!name.trim()) return;
    const slug = name.trim().replace(/ /g, "-").toLowerCase();
    const path = `${folder}/${slug}.md`;
    const content = text.trim() ? `# ${name}\n\n${text}` : `# ${name}\n\n`;
    await fetch("/api/notes", {
      method:"POST",
      headers:{"Content-Type":"application/json","x-app-password":password},
      body:JSON.stringify({path,content}),
    });
    onCreated({path,name:name.trim()});
    onClose();
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:80 }} onClick={onClose}>
      <div style={{ background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,width:560,padding:20,boxShadow:"0 20px 60px #00000066" }} onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
          <Zap size={16} color={t.accent}/>
          <span style={{ fontWeight:600,fontSize:14,color:t.text }}>Capture rapide</span>
          <button onClick={onClose} style={{ marginLeft:"auto",background:"none",border:"none",color:t.muted,cursor:"pointer" }}><X size={14}/></button>
        </div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Titre de la note..." autoFocus
          onKeyDown={e => e.key==="Enter" && !e.shiftKey && capture()}
          style={{ width:"100%",padding:"10px 14px",background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:14,outline:"none",marginBottom:10 }}/>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Contenu (optionnel)..." rows={4}
          style={{ width:"100%",padding:"10px 14px",background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:13,outline:"none",resize:"none",fontFamily:"'JetBrains Mono',monospace",marginBottom:10 }}/>
        <div style={{ display:"flex",gap:8,alignItems:"center" }}>
          <select value={folder} onChange={e => setFolder(e.target.value)}
            style={{ flex:1,background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:8,color:t.muted,fontSize:13,padding:"8px 12px",outline:"none" }}>
            <option value="notes">📄 Racine</option>
            {folders.map(f => <option key={f} value={`notes/${f}`}>📁 {f}</option>)}
          </select>
          <button onClick={capture}
            style={{ padding:"8px 20px",background:t.accent,border:"none",borderRadius:8,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer" }}>
            Capturer ⚡
          </button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ notes, favorites, t, onOpenNote }: { notes: Note[]; favorites: string[]; t: Theme; onOpenNote: (n: Note) => void }) {
  const totalWords = notes.reduce((acc, n) => acc + wordCount(n.content || ""), 0);
  const allTags = [...new Set(notes.flatMap(n => extractTags(n.content || "")))];
  const recentNotes = [...notes].slice(0, 5);
  const favNotes = notes.filter(n => favorites.includes(n.path));

  return (
    <div style={{ flex:1,overflowY:"auto",padding:"40px 60px" }}>
      <div style={{ maxWidth:800,margin:"0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom:32 }}>
          <div style={{ fontSize:28,fontWeight:700,color:t.text,marginBottom:6 }}>Bonjour AL 👋</div>
          <div style={{ fontSize:14,color:t.muted }}>{new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
        </div>

        {/* Stats */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:28 }}>
          {[
            { label:"Notes", value:notes.length, icon:"📄", color:"#6e00ff" },
            { label:"Mots", value:totalWords.toLocaleString(), icon:"✍️", color:"#00d4ff" },
            { label:"Tags", value:allTags.length, icon:"🏷️", color:"#f0b429" },
            { label:"Favoris", value:favNotes.length, icon:"⭐", color:"#ff6b35" },
          ].map(s => (
            <div key={s.label} style={{ background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:"16px",textAlign:"center" }}>
              <div style={{ fontSize:24,marginBottom:6 }}>{s.icon}</div>
              <div style={{ fontSize:22,fontWeight:700,color:t.text }}>{s.value}</div>
              <div style={{ fontSize:12,color:t.muted }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Recent + Favs */}
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:24 }}>
          <div style={{ background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:16 }}>
            <div style={{ fontSize:13,fontWeight:600,color:t.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:12 }}>📝 Notes récentes</div>
            {recentNotes.length===0 && <div style={{ color:t.muted,fontSize:13 }}>Aucune note</div>}
            {recentNotes.map(n => (
              <button key={n.path} onClick={() => onOpenNote(n)}
                style={{ display:"flex",alignItems:"center",gap:8,width:"100%",padding:"6px 0",background:"none",border:"none",borderBottom:`1px solid ${t.border}22`,cursor:"pointer",textAlign:"left" }}>
                <FileText size={13} color={t.muted}/>
                <span style={{ fontSize:13,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{n.path.split("/").pop()?.replace(".md","")}</span>
                <span style={{ fontSize:11,color:t.muted,marginLeft:"auto",whiteSpace:"nowrap" }}>{n.path.includes("/")?n.path.split("/").slice(-2,-1)[0]:""}</span>
              </button>
            ))}
          </div>
          <div style={{ background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:16 }}>
            <div style={{ fontSize:13,fontWeight:600,color:t.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:12 }}>⭐ Favoris</div>
            {favNotes.length===0 && <div style={{ color:t.muted,fontSize:13 }}>Aucun favori</div>}
            {favNotes.map(n => (
              <button key={n.path} onClick={() => onOpenNote(n)}
                style={{ display:"flex",alignItems:"center",gap:8,width:"100%",padding:"6px 0",background:"none",border:"none",borderBottom:`1px solid ${t.border}22`,cursor:"pointer",textAlign:"left" }}>
                <Star size={13} color="#f0b429" fill="#f0b429"/>
                <span style={{ fontSize:13,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{n.path.split("/").pop()?.replace(".md","")}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tags cloud */}
        {allTags.length > 0 && (
          <div style={{ background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:16 }}>
            <div style={{ fontSize:13,fontWeight:600,color:t.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:12 }}>🏷️ Tags</div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
              {allTags.map(tag => (
                <span key={tag} style={{ padding:"3px 10px",borderRadius:20,fontSize:12,background:t.accentBg,color:t.accent,border:`1px solid ${t.accent}33` }}>#{tag}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function Brain() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [active, setActive] = useState<Note | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [viewMode, setViewMode] = useState<"edit"|"preview"|"split">("edit");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{note:Note;excerpt:string}[]|null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newNoteName, setNewNoteName] = useState("");
  const [newNoteFolder, setNewNoteFolder] = useState("notes");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [renaming, setRenaming] = useState<Note|null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["cybersec","projets","cours","ressources"]));
  const [favorites, setFavorites] = useState<string[]>([]);
  const [activeTag, setActiveTag] = useState<string|null>(null);
  const [showDownload, setShowDownload] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const t = darkMode ? DARK : LIGHT;

  useEffect(() => {
    const s = sessionStorage.getItem(PASSWORD_KEY);
    if (s) { setPassword(s); setAuthed(true); }
    const favs = localStorage.getItem(FAVS_KEY);
    if (favs) try { setFavorites(JSON.parse(favs)); } catch {}
    const theme = localStorage.getItem(THEME_KEY);
    if (theme) setDarkMode(theme === "dark");
    else setDarkMode(true);
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

  function toggleTheme() {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem(THEME_KEY, next ? "dark" : "light");
  }

  async function openNote(note: Note) {
    const res = await fetch(`/api/notes?path=${encodeURIComponent(note.path)}`);
    const data = await res.json();
    setActive(data); setContent(data.content||""); setOriginalContent(data.content||"");
    setShowDashboard(false); setShowDownload(false); setSearchResults(null); setSearch("");
  }

  async function saveNote() {
    if (!active||saving) return;
    setSaving(true);
    await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path:active.path,content,sha:active.sha})});
    const updated = await fetch(`/api/notes?path=${encodeURIComponent(active.path)}`).then(r=>r.json());
    setActive(updated); setOriginalContent(content); setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),2500);
  }

  async function trashNote() {
    if (!active||!confirm(`Mettre "${active.name}" à la corbeille ?`)) return;
    setDeleting(true);
    const trashPath = active.path.replace(/^notes\//, "notes/_trash/");
    await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path:trashPath,content})});
    await fetch("/api/notes",{method:"DELETE",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path:active.path,sha:active.sha})});
    setActive(null); setContent(""); setDeleting(false); fetchNotes();
  }

  async function createNote() {
    if (!newNoteName.trim()) return;
    const slug = newNoteName.trim().replace(/ /g,"-").toLowerCase();
    const path = `${newNoteFolder}/${slug}.md`;
    const initial = selectedTemplate ? TEMPLATES[selectedTemplate] : `# ${newNoteName.trim()}\n\n`;
    await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path,content:initial})});
    setNewNoteName(""); setCreating(false); setSelectedTemplate("");
    await fetchNotes(); await openNote({path,name:newNoteName.trim()});
  }

  async function renameNote() {
    if (!renaming||!renameTo.trim()) return;
    const parts = renaming.path.split("/"); parts[parts.length-1] = renameTo.trim().replace(/ /g,"-").toLowerCase()+".md";
    const newPath = parts.join("/");
    await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path:newPath,content:renaming.content||""})});
    if (renaming.sha) await fetch("/api/notes",{method:"DELETE",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path:renaming.path,sha:renaming.sha})});
    setRenaming(null); setRenameTo(""); fetchNotes();
    if (active?.path===renaming.path) openNote({path:newPath,name:renameTo.trim()});
  }

  function toggleFavorite(path: string) {
    const n = favorites.includes(path) ? favorites.filter(f=>f!==path) : [...favorites,path];
    setFavorites(n); localStorage.setItem(FAVS_KEY,JSON.stringify(n));
  }

  async function doSearch(query: string) {
    if (!query.trim()) { setSearchResults(null); return; }
    const results: {note:Note;excerpt:string}[] = [];
    for (const note of notes) {
      if (note.name.toLowerCase().includes(query.toLowerCase())) { results.push({note,excerpt:`📄 ${note.name}`}); continue; }
      try {
        const res = await fetch(`/api/notes?path=${encodeURIComponent(note.path)}`);
        const data = await res.json();
        if (data.content?.toLowerCase().includes(query.toLowerCase())) {
          const idx = data.content.toLowerCase().indexOf(query.toLowerCase());
          const start = Math.max(0,idx-60);
          results.push({note,excerpt:"..."+data.content.slice(start,idx+query.length+60)+"..."});
        }
      } catch {}
    }
    setSearchResults(results);
  }

  function downloadMd() { if(!active)return; const b=new Blob([content],{type:"text/markdown"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=`${active.name}.md`; a.click(); }
  function downloadHtml() { if(!active)return; const b=new Blob([markdownToHtml(content,active.name,darkMode)],{type:"text/html"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=`${active.name}.html`; a.click(); }
  function downloadTxt() { if(!active)return; const b=new Blob([content],{type:"text/plain"}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=`${active.name}.txt`; a.click(); }
  function printPdf() { if(!active)return; const w=window.open("","_blank"); if(!w)return; w.document.write(markdownToHtml(content,active.name,darkMode)); w.document.close(); w.onload=()=>w.print(); }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey||e.metaKey)&&e.key==="s") { e.preventDefault(); saveNote(); }
      if ((e.ctrlKey||e.metaKey)&&e.key==="p") { e.preventDefault(); setViewMode(v=>v==="preview"?"edit":"preview"); }
      if ((e.ctrlKey||e.metaKey)&&e.key==="d") { e.preventDefault(); setViewMode(v=>v==="split"?"edit":"split"); }
      if ((e.ctrlKey||e.metaKey)&&e.key==="k") { e.preventDefault(); setShowQuickCapture(true); }
      if (e.key==="F11") { e.preventDefault(); setFocusMode(v=>!v); }
      if (e.key==="Escape") { setShowDownload(false); setCreating(false); setShowHistory(false); setShowShortcuts(false); setShowQuickCapture(false); setRenaming(null); if(focusMode)setFocusMode(false); }
      if (e.key==="?"&&!["INPUT","TEXTAREA"].includes((e.target as Element).tagName)) setShowShortcuts(true);
    }
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  });

  const isDirty = content !== originalContent;
  const tree = buildTree(notes);
  const folders = Object.keys(tree.subfolders);
  const allTags = [...new Set(notes.flatMap(n=>extractTags(n.content||"")))];
  const favNotes = notes.filter(n=>favorites.includes(n.path));
  const headings = active ? extractHeadings(content) : [];
  const displayNotes = searchResults!==null ? searchResults.map(r=>r.note) : activeTag ? notes.filter(n=>extractTags(n.content||"").includes(activeTag)) : null;

  if (loading) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0d1117",color:"#8b949e",fontSize:14 }}>chargement...</div>;
  if (!authed) return <AuthScreen onAuth={handleAuth} />;

  return (
    <div style={{ display:"flex",height:"100vh",background:t.bg,color:t.text,fontFamily:"'Inter',sans-serif",overflow:"hidden" }}>

      {/* ── Sidebar ── */}
      {!focusMode && (
        <aside style={{ width:260,minWidth:260,background:t.bg,borderRight:`1px solid ${t.border}`,display:"flex",flexDirection:"column",overflow:"hidden" }}>

          {/* Logo */}
          <div style={{ padding:"16px 16px 12px",borderBottom:`1px solid ${t.border}` }}>
            <div style={{ display:"flex",alignItems:"center",gap:10 }}>
              <div style={{ width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#6e00ff,#00d4ff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>🧠</div>
              <div>
                <div style={{ fontWeight:700,fontSize:14,color:t.text,letterSpacing:"-0.3px" }}>pazent.brain</div>
                <div style={{ fontSize:11,color:t.muted }}>{notes.length} notes</div>
              </div>
              <div style={{ marginLeft:"auto",display:"flex",gap:2 }}>
                <button onClick={() => setShowDashboard(v=>!v)} style={{ background:"none",border:"none",cursor:"pointer",color:showDashboard?t.accent:t.muted,padding:4,borderRadius:4 }} title="Dashboard">
                  <BarChart2 size={13}/>
                </button>
                <button onClick={toggleTheme} style={{ background:"none",border:"none",cursor:"pointer",color:t.muted,padding:4,borderRadius:4 }} title={darkMode?"Mode clair":"Mode sombre"}>
                  <span style={{ fontSize:13 }}>{darkMode?"☀️":"🌙"}</span>
                </button>
                <button onClick={fetchNotes} style={{ background:"none",border:"none",cursor:"pointer",color:t.muted,padding:4,borderRadius:4 }}>
                  <RefreshCw size={13}/>
                </button>
              </div>
            </div>
          </div>

          {/* Search */}
          <div style={{ padding:"10px 12px 4px" }}>
            <div style={{ display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:8 }}>
              <Search size={13} color={t.muted}/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&doSearch(search)}
                placeholder="Rechercher (Entrée=full text)"
                style={{ background:"none",border:"none",outline:"none",color:t.text,fontSize:13,width:"100%" }}/>
              {search && <button onClick={()=>{setSearch("");setSearchResults(null);}} style={{ background:"none",border:"none",cursor:"pointer",color:t.muted,padding:0 }}><X size={12}/></button>}
            </div>
          </div>

          {/* New note */}
          <div style={{ padding:"4px 12px 8px" }}>
            {creating ? (
              <div style={{ background:t.surface,border:`1px solid ${t.accent}44`,borderRadius:8,padding:10 }}>
                <input value={newNoteName} onChange={e=>setNewNoteName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createNote()}
                  placeholder="Nom de la note..." autoFocus
                  style={{ width:"100%",background:"none",border:"none",outline:"none",color:t.text,fontSize:13,marginBottom:8 }}/>
                <select value={newNoteFolder} onChange={e=>setNewNoteFolder(e.target.value)}
                  style={{ width:"100%",background:t.bg,border:`1px solid ${t.border}`,borderRadius:6,color:t.muted,fontSize:12,padding:"4px 8px",marginBottom:8,outline:"none" }}>
                  <option value="notes">📄 Racine</option>
                  {folders.map(f=><option key={f} value={`notes/${f}`}>📁 {f}</option>)}
                </select>
                <select value={selectedTemplate} onChange={e=>setSelectedTemplate(e.target.value)}
                  style={{ width:"100%",background:t.bg,border:`1px solid ${t.border}`,borderRadius:6,color:t.muted,fontSize:12,padding:"4px 8px",marginBottom:8,outline:"none" }}>
                  <option value="">Pas de template</option>
                  {Object.keys(TEMPLATES).map(tpl=><option key={tpl} value={tpl}>{tpl}</option>)}
                </select>
                <div style={{ display:"flex",gap:6 }}>
                  <button onClick={createNote} style={{ flex:1,padding:"6px 0",background:t.accent,border:"none",borderRadius:6,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer" }}>Créer</button>
                  <button onClick={()=>setCreating(false)} style={{ padding:"6px 10px",background:t.surface2,border:"none",borderRadius:6,color:t.muted,fontSize:12,cursor:"pointer" }}>✕</button>
                </div>
              </div>
            ) : (
              <button onClick={()=>setCreating(true)}
                style={{ display:"flex",alignItems:"center",gap:8,width:"100%",padding:"7px 10px",background:"none",border:`1px dashed ${t.border}`,borderRadius:8,color:t.muted,fontSize:13,cursor:"pointer" }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=t.accent+"44";e.currentTarget.style.color=t.accent;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.muted;}}>
                <Plus size={13}/> Nouvelle note
              </button>
            )}
          </div>

          {/* Notes list */}
          <nav style={{ flex:1,overflowY:"auto",padding:"4px 8px 8px" }}>
            {searchResults!==null ? (
              <div>
                <div style={{ padding:"4px 8px",fontSize:11,color:t.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4 }}>{searchResults.length} résultat{searchResults.length!==1?"s":""}</div>
                {searchResults.map(r=>(
                  <div key={r.note.path}>
                    <NoteRow note={r.note} active={active} favorites={favorites} t={t} onToggleFav={toggleFavorite} onClick={()=>openNote(r.note)} onRename={()=>{setRenaming(r.note);setRenameTo(r.note.name);}}/>
                    <div style={{ fontSize:11,color:t.muted,padding:"0 8px 6px 28px",lineHeight:1.4 }} dangerouslySetInnerHTML={{__html:highlightText(r.excerpt.slice(0,130),search)}}/>
                  </div>
                ))}
              </div>
            ) : activeTag ? (
              <div>
                <div style={{ display:"flex",alignItems:"center",gap:6,padding:"4px 8px",fontSize:11,color:t.accent,fontWeight:600,marginBottom:4 }}>
                  <Tag size={11}/> #{activeTag}
                  <button onClick={()=>setActiveTag(null)} style={{ background:"none",border:"none",color:t.muted,cursor:"pointer",fontSize:11,marginLeft:"auto" }}>✕</button>
                </div>
                {(displayNotes||[]).map(n=><NoteRow key={n.path} note={n} active={active} favorites={favorites} t={t} onToggleFav={toggleFavorite} onClick={()=>openNote(n)} onRename={()=>{setRenaming(n);setRenameTo(n.name);}}/>)}
              </div>
            ) : (
              <>
                {favNotes.length>0 && (
                  <div style={{ marginBottom:8 }}>
                    <div style={{ padding:"4px 8px",fontSize:11,color:t.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2 }}>⭐ Favoris</div>
                    {favNotes.map(n=><NoteRow key={n.path} note={n} active={active} favorites={favorites} t={t} onToggleFav={toggleFavorite} onClick={()=>openNote(n)} onRename={()=>{setRenaming(n);setRenameTo(n.name);}}/>)}
                    <div style={{ height:1,background:t.border,margin:"8px 0" }}/>
                  </div>
                )}
                {tree.notes.map(n=><NoteRow key={n.path} note={n} active={active} favorites={favorites} t={t} onToggleFav={toggleFavorite} onClick={()=>openNote(n)} onRename={()=>{setRenaming(n);setRenameTo(n.name);}}/>)}
                {folders.map(folder=>(
                  <div key={folder} style={{ marginTop:4 }}>
                    <div style={{ display:"flex",alignItems:"center" }}>
                      <button onClick={()=>setExpandedFolders(prev=>{const s=new Set(prev);s.has(folder)?s.delete(folder):s.add(folder);return s;})}
                        style={{ display:"flex",alignItems:"center",gap:6,flex:1,padding:"5px 8px",background:"none",border:"none",color:t.muted,fontSize:12,fontWeight:600,cursor:"pointer",borderRadius:6,textTransform:"uppercase",letterSpacing:"0.5px" }}
                        onMouseEnter={e=>(e.currentTarget.style.background=t.hoverBg)}
                        onMouseLeave={e=>(e.currentTarget.style.background="none")}>
                        {expandedFolders.has(folder)?<ChevronDown size={12}/>:<ChevronRight size={12}/>}
                        {expandedFolders.has(folder)?<FolderOpen size={12}/>:<Folder size={12}/>}
                        {folder}
                        <span style={{ marginLeft:"auto",fontSize:10,opacity:.6 }}>{tree.subfolders[folder].notes.length}</span>
                      </button>
                      <button onClick={()=>{setNewNoteFolder(`notes/${folder}`);setCreating(true);}}
                        style={{ padding:"3px 5px",background:"none",border:"none",color:t.muted,cursor:"pointer",borderRadius:4,opacity:.4 }}
                        onMouseEnter={e=>(e.currentTarget.style.opacity="1")} onMouseLeave={e=>(e.currentTarget.style.opacity=".4")}>
                        <Plus size={11}/>
                      </button>
                    </div>
                    {expandedFolders.has(folder)&&(
                      <div style={{ paddingLeft:12 }}>
                        {tree.subfolders[folder].notes.map(n=><NoteRow key={n.path} note={n} active={active} favorites={favorites} t={t} onToggleFav={toggleFavorite} onClick={()=>openNote(n)} onRename={()=>{setRenaming(n);setRenameTo(n.name);}}/>)}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </nav>

          {/* Tags */}
          {allTags.length>0&&(
            <div style={{ padding:"8px 12px",borderTop:`1px solid ${t.border}` }}>
              <div style={{ fontSize:11,color:t.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,display:"flex",alignItems:"center",gap:6 }}>
                <Tag size={11}/> Tags
              </div>
              <div style={{ display:"flex",flexWrap:"wrap",gap:4 }}>
                {allTags.map(tag=>(
                  <button key={tag} onClick={()=>setActiveTag(activeTag===tag?null:tag)}
                    style={{ padding:"2px 8px",borderRadius:20,fontSize:11,cursor:"pointer",border:"none",background:activeTag===tag?t.accent:t.surface2,color:activeTag===tag?"#fff":t.muted }}>
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ padding:"6px 12px",borderTop:`1px solid ${t.border}`,fontSize:11,color:t.muted,display:"flex",alignItems:"center",gap:6,cursor:"pointer" }} onClick={()=>setShowShortcuts(true)}>
            <Keyboard size={11}/> <span>Raccourcis</span>
            <kbd style={{ marginLeft:"auto",background:t.surface2,border:`1px solid ${t.border}`,borderRadius:3,padding:"1px 5px",fontSize:10 }}>?</kbd>
          </div>
        </aside>
      )}

      {/* ── Main ── */}
      <main style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative" }}>

        {/* Focus bar */}
        {focusMode&&<div style={{ position:"fixed",top:0,left:0,right:0,height:3,background:"linear-gradient(90deg,#6e00ff,#00d4ff)",zIndex:100 }}/>}

        {/* Topbar */}
        {!focusMode&&(
          <div style={{ display:"flex",alignItems:"center",gap:8,padding:"0 16px",height:48,borderBottom:`1px solid ${t.border}`,background:t.bg,flexShrink:0 }}>
            {active&&!showDashboard ? (
              <>
                <div style={{ display:"flex",alignItems:"center",gap:6,fontSize:13,color:t.muted,flex:1,minWidth:0,overflow:"hidden" }}>
                  <button onClick={()=>setShowDashboard(true)} style={{ background:"none",border:"none",cursor:"pointer",color:t.muted,padding:0,fontSize:13 }}>notes</button>
                  {active.path.includes("/",6)&&(<><ChevronRight size={12}/><span>{active.path.replace(/^notes\//,"").split("/")[0]}</span></>)}
                  <ChevronRight size={12}/>
                  {renaming?.path===active.path ? (
                    <input value={renameTo} onChange={e=>setRenameTo(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")renameNote();if(e.key==="Escape")setRenaming(null);}}
                      autoFocus style={{ background:"none",border:"none",outline:`1px solid ${t.accent}`,borderRadius:4,color:t.text,fontSize:13,fontWeight:500,padding:"0 4px" }}/>
                  ) : (
                    <span style={{ color:t.text,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer" }}
                      onDoubleClick={()=>{setRenaming(active);setRenameTo(active.name);}}>
                      {active.name}
                    </span>
                  )}
                  {isDirty&&<span style={{ width:6,height:6,borderRadius:"50%",background:t.accent,flexShrink:0 }}/>}
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:8,fontSize:12,color:t.muted,flexShrink:0 }}>
                  <span style={{ display:"flex",alignItems:"center",gap:4 }}><AlignLeft size={11}/>{wordCount(content)}</span>
                  <span style={{ display:"flex",alignItems:"center",gap:4 }}><Clock size={11}/>{readTime(content)} min</span>
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:3,flexShrink:0 }}>
                  <div style={{ display:"flex",background:t.surface,border:`1px solid ${t.border}`,borderRadius:7,overflow:"hidden" }}>
                    {(["edit","split","preview"] as const).map(mode=>(
                      <button key={mode} onClick={()=>setViewMode(mode)}
                        style={{ padding:"5px 10px",background:viewMode===mode?t.accentBg:"none",border:"none",color:viewMode===mode?t.accent:t.muted,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:5 }}>
                        {mode==="edit"&&<><Edit3 size={12}/> Éditer</>}
                        {mode==="split"&&<><Columns size={12}/> Split</>}
                        {mode==="preview"&&<><Eye size={12}/> Preview</>}
                      </button>
                    ))}
                  </div>
                  {headings.length>0&&(
                    <button onClick={()=>setShowTOC(!showTOC)}
                      style={{ padding:"5px 8px",background:showTOC?t.accentBg:t.surface,border:`1px solid ${showTOC?t.accent+"44":t.border}`,borderRadius:7,color:showTOC?t.accent:t.muted,cursor:"pointer" }} title="Sommaire">
                      <ListIcon size={13}/>
                    </button>
                  )}
                  <button onClick={()=>setShowHistory(true)}
                    style={{ padding:"5px 8px",background:t.surface,border:`1px solid ${t.border}`,borderRadius:7,color:t.muted,cursor:"pointer" }} title="Historique">
                    <History size={13}/>
                  </button>
                  <button onClick={()=>setFocusMode(true)}
                    style={{ padding:"5px 8px",background:t.surface,border:`1px solid ${t.border}`,borderRadius:7,color:t.muted,cursor:"pointer" }} title="Mode focus (F11)">
                    <Maximize2 size={13}/>
                  </button>
                  <div style={{ position:"relative" }}>
                    <button onClick={()=>setShowDownload(!showDownload)}
                      style={{ display:"flex",alignItems:"center",gap:5,padding:"5px 10px",background:t.surface,border:`1px solid ${t.border}`,borderRadius:7,color:t.muted,fontSize:12,cursor:"pointer" }}>
                      <Download size={13}/> Exporter
                    </button>
                    {showDownload&&(
                      <div style={{ position:"absolute",top:"calc(100% + 6px)",right:0,background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:6,zIndex:100,minWidth:170,boxShadow:"0 8px 32px #00000066" }}>
                        {[{icon:<FileDown size={13}/>,label:"Markdown (.md)",fn:downloadMd},{icon:<ExternalLink size={13}/>,label:"HTML (.html)",fn:downloadHtml},{icon:<Hash size={13}/>,label:"Texte brut (.txt)",fn:downloadTxt},{icon:<FileText size={13}/>,label:"PDF (imprimer)",fn:printPdf}].map(({icon,label,fn})=>(
                          <button key={label} onClick={()=>{fn();setShowDownload(false);}}
                            style={{ display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 12px",background:"none",border:"none",borderRadius:7,color:t.text,fontSize:13,cursor:"pointer",textAlign:"left" }}
                            onMouseEnter={e=>(e.currentTarget.style.background=t.hoverBg)}
                            onMouseLeave={e=>(e.currentTarget.style.background="none")}>
                            <span style={{ color:t.muted }}>{icon}</span>{label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={saveNote} disabled={saving||!isDirty}
                    style={{ display:"flex",alignItems:"center",gap:5,padding:"5px 12px",background:saved?"#00d4ff22":isDirty?t.accent:t.surface,border:`1px solid ${saved?"#00d4ff44":isDirty?"transparent":t.border}`,borderRadius:7,color:saved?"#00d4ff":isDirty?"#fff":t.muted,fontSize:12,fontWeight:600,cursor:isDirty?"pointer":"default",opacity:saving?.6:1 }}>
                    {saved?<Check size={13}/>:<Save size={13}/>}
                    {saved?"Sauvegardé":saving?"...":"Sauvegarder"}
                  </button>
                  <button onClick={trashNote} disabled={deleting}
                    style={{ padding:"5px 8px",background:"none",border:`1px solid ${t.border}`,borderRadius:7,color:t.muted,cursor:"pointer" }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="#ff444444";e.currentTarget.style.color="#ff4444";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.muted;}}>
                    <Trash2 size={13}/>
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display:"flex",alignItems:"center",gap:8,fontSize:13,color:t.muted }}>
                {showDashboard ? <><BarChart2 size={14} color={t.accent}/><span style={{ color:t.text,fontWeight:500 }}>Dashboard</span></> : <span>← Sélectionne ou crée une note</span>}
              </div>
            )}
          </div>
        )}

        {/* Markdown toolbar */}
        {active&&viewMode==="edit"&&!focusMode&&!showDashboard&&(
          <div style={{ display:"flex",alignItems:"center",gap:2,padding:"4px 16px",borderBottom:`1px solid ${t.border}`,background:t.bg,flexShrink:0 }}>
            {[{icon:<Bold size={13}/>,before:"**",after:"**",ph:"gras"},{icon:<Italic size={13}/>,before:"*",after:"*",ph:"italique"},{icon:<Hash size={13}/>,before:"# ",after:"",ph:"titre"},{icon:<ListIcon size={13}/>,before:"- ",after:"",ph:"item"},{icon:<Link2 size={13}/>,before:"[",after:"](url)",ph:"lien"},{icon:<Code size={13}/>,before:"```\n",after:"\n```",ph:"code"}].map(({icon,before,after,ph},i)=>(
              <button key={i} onClick={()=>insertMd(textareaRef,before,after,ph)}
                style={{ padding:"3px 7px",background:"none",border:"none",borderRadius:5,color:t.muted,cursor:"pointer" }}
                onMouseEnter={e=>(e.currentTarget.style.background=t.hoverBg)}
                onMouseLeave={e=>(e.currentTarget.style.background="none")}>
                {icon}
              </button>
            ))}
            <button onClick={()=>setShowQuickCapture(true)}
              style={{ marginLeft:"auto",display:"flex",alignItems:"center",gap:5,padding:"3px 10px",background:"none",border:`1px solid ${t.border}`,borderRadius:5,color:t.muted,cursor:"pointer",fontSize:12 }}>
              <Zap size={11}/> Capture rapide
            </button>
          </div>
        )}

        {/* Content */}
        <div style={{ flex:1,overflow:"hidden",display:"flex" }}>
          {showDashboard ? (
            <Dashboard notes={notes} favorites={favorites} t={t} onOpenNote={note=>{openNote(note);}}/>
          ) : !active ? (
            <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,color:t.muted }}>
              <div style={{ width:64,height:64,borderRadius:16,background:`linear-gradient(135deg,${t.accent}11,#00d4ff11)`,border:`1px solid ${t.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28 }}>🧠</div>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:15,fontWeight:500,color:t.text,marginBottom:6 }}>Aucune note sélectionnée</div>
                <div style={{ fontSize:13,color:t.muted }}>Sélectionne une note ou crée-en une nouvelle</div>
              </div>
              <div style={{ display:"flex",gap:8 }}>
                <button onClick={()=>setCreating(true)} style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 16px",background:t.accent,border:"none",borderRadius:8,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer" }}>
                  <Plus size={14}/> Nouvelle note
                </button>
                <button onClick={()=>setShowDashboard(true)} style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 16px",background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:13,cursor:"pointer" }}>
                  <BarChart2 size={14}/> Dashboard
                </button>
              </div>
            </div>
          ) : (
            <>
              {(viewMode==="edit"||viewMode==="split")&&(
                <div style={{ flex:1,overflow:"hidden",borderRight:viewMode==="split"?`1px solid ${t.border}`:"none" }}>
                  <textarea ref={textareaRef} value={content} onChange={e=>setContent(e.target.value)}
                    style={{ width:"100%",height:"100%",padding:focusMode?"60px 80px":"32px 48px",background:t.editorBg,color:t.text,border:"none",outline:"none",resize:"none",fontFamily:"'JetBrains Mono',monospace",fontSize:14,lineHeight:1.9,caretColor:"#00d4ff" }}
                    placeholder="Commence à écrire en Markdown..." spellCheck={false}/>
                </div>
              )}
              {(viewMode==="preview"||viewMode==="split")&&(
                <div style={{ flex:1,overflowY:"auto",padding:focusMode?"60px 80px":"32px 48px" }}>
                  <article className="prose" style={{ maxWidth:760,margin:"0 auto" }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                      {content}
                    </ReactMarkdown>
                  </article>
                </div>
              )}
              {showTOC&&headings.length>0&&(
                <div style={{ width:200,borderLeft:`1px solid ${t.border}`,padding:"16px 12px",overflowY:"auto",background:t.bg }}>
                  <div style={{ fontSize:11,fontWeight:600,color:t.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10,display:"flex",alignItems:"center",gap:6 }}>
                    <ListIcon size={11}/> Sommaire
                    <button onClick={()=>setShowTOC(false)} style={{ marginLeft:"auto",background:"none",border:"none",color:t.muted,cursor:"pointer" }}><X size={11}/></button>
                  </div>
                  {headings.map((h,i)=>(
                    <button key={i}
                      style={{ display:"block",width:"100%",textAlign:"left",padding:`3px ${(h.level-1)*10}px`,background:"none",border:"none",color:h.level===1?t.text:h.level===2?"#c9d1d9":t.muted,fontSize:h.level===1?13:h.level===2?12:11,cursor:"pointer",lineHeight:1.4,marginBottom:2,borderRadius:4 }}
                      onMouseEnter={e=>(e.currentTarget.style.color=t.accent)}
                      onMouseLeave={e=>(e.currentTarget.style.color=h.level===1?t.text:h.level===2?"#c9d1d9":t.muted)}>
                      {h.text}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Focus save */}
        {focusMode&&active&&(
          <div style={{ position:"fixed",bottom:24,right:24,display:"flex",gap:8,zIndex:200 }}>
            <button onClick={()=>setFocusMode(false)} style={{ padding:"8px 12px",background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.muted,cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13 }}>
              <Minimize2 size={14}/> Quitter
            </button>
            <button onClick={saveNote} disabled={saving||!isDirty}
              style={{ padding:"8px 16px",background:isDirty?t.accent:t.surface,border:"none",borderRadius:8,color:isDirty?"#fff":t.muted,cursor:isDirty?"pointer":"default",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6 }}>
              <Save size={14}/>{saved?"Sauvegardé ✓":"Sauvegarder"}
            </button>
          </div>
        )}
      </main>

      {/* Modals */}
      {showHistory&&active&&<HistoryModal note={active} t={t} onRestore={c=>{setContent(c);setShowHistory(false);}} onClose={()=>setShowHistory(false)}/>}
      {showShortcuts&&<ShortcutsModal t={t} onClose={()=>setShowShortcuts(false)}/>}
      {showQuickCapture&&<QuickCapture t={t} folders={folders} password={password} onCreated={async n=>{await fetchNotes();await openNote(n);}} onClose={()=>setShowQuickCapture(false)}/>}
      {showDownload&&<div onClick={()=>setShowDownload(false)} style={{ position:"fixed",inset:0,zIndex:50 }}/>}
    </div>
  );
}

function NoteRow({ note, active, favorites, t, onToggleFav, onClick, onRename }: { note:Note; active:Note|null; favorites:string[]; t:Theme; onToggleFav:(p:string)=>void; onClick:()=>void; onRename:()=>void }) {
  const isActive = active?.path===note.path;
  const isFav = favorites.includes(note.path);
  const name = note.path.split("/").pop()?.replace(".md","") || note.name;
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ display:"flex",alignItems:"center",marginBottom:1 }} onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}>
      <button onClick={onClick}
        style={{ display:"flex",alignItems:"center",gap:7,flex:1,padding:"5px 8px",background:isActive?t.accentBg:"none",border:`1px solid ${isActive?t.accent+"33":"transparent"}`,borderRadius:7,color:isActive?"#a78bfa":t.text,fontSize:13,cursor:"pointer",textAlign:"left",minWidth:0 }}
        onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background=t.hoverBg;}}
        onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background="none";}}>
        <FileText size={12} color={isActive?t.accent:t.muted} style={{ flexShrink:0 }}/>
        <span style={{ overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1 }}>{name}</span>
      </button>
      {(hovered||isFav)&&(
        <button onClick={e=>{e.stopPropagation();onToggleFav(note.path);}}
          style={{ padding:"4px 5px",background:"none",border:"none",cursor:"pointer",color:isFav?"#f0b429":t.muted,flexShrink:0 }}>
          <Star size={11} fill={isFav?"#f0b429":"none"}/>
        </button>
      )}
    </div>
  );
}
