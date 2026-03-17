"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  FileText, FolderOpen, Folder, Plus, Search, Save, Trash2, Eye, Edit3,
  ChevronRight, ChevronDown, Download, Code, Hash, AlignLeft, Clock,
  Bold, Italic, Link2, X, Check, Star, RefreshCw, Columns, Maximize2,
  Minimize2, History, Tag, List as ListIcon, Keyboard, Lock,
  Zap, RotateCcw, Upload, File, Image as ImageIcon, FileArchive, Menu,
  HardDrive, StickyNote, Settings, WrapText, Flame
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface Note { path: string; name: string; content?: string; sha?: string; }
interface GFile { name: string; path: string; type: string; size: number; download_url: string; }
interface FolderNode { name: string; notes: Note[]; subfolders: Record<string, FolderNode>; }

const PASSWORD_KEY  = "pazent_brain_auth";
const FAVS_KEY      = "pazent_brain_favs";
const THEME_KEY     = "pazent_brain_theme";
const AUTOSAVE_KEY  = "pazent_brain_autosave";
const WORDWRAP_KEY  = "pazent_brain_wordwrap";
const STREAK_KEY    = "pazent_brain_streak";
const MODIFIED_KEY  = "pazent_brain_modified";

interface StreakData { lastDate: string; count: number; }

interface Theme {
  bg: string; surface: string; surface2: string; border: string;
  text: string; muted: string; accent: string; accentBg: string;
  editorBg: string; inputBg: string; hoverBg: string; shadowColor: string;
}
const DARK: Theme = {
  bg:"#0d1117", surface:"#161b22", surface2:"#1c2128", border:"#21262d",
  text:"#e6edf3", muted:"#8b949e", accent:"#6e00ff", accentBg:"#6e00ff18",
  editorBg:"#0d1117", inputBg:"#161b22", hoverBg:"#1c2128", shadowColor:"#00000066"
};
const LIGHT: Theme = {
  bg:"#f6f8fa", surface:"#ffffff", surface2:"#f3f4f6", border:"#d0d7de",
  text:"#1f2328", muted:"#57606a", accent:"#6e00ff", accentBg:"#6e00ff10",
  editorBg:"#ffffff", inputBg:"#f6f8fa", hoverBg:"#f3f4f6", shadowColor:"#00000022"
};

const TEMPLATES: Record<string, string> = {
  "Writeup CTF": `# Writeup — [Nom du challenge]\n\n**Plateforme:** HackTheBox / TryHackMe\n**Catégorie:** Web / Pwn / Crypto / Forensics\n**Difficulté:** Easy / Medium / Hard\n**Date:** ${new Date().toLocaleDateString("fr-FR")}\n\n---\n\n## Reconnaissance\n\n## Exploitation\n\n## Flag\n\n\`\`\`\nflag{...}\n\`\`\`\n\n## Lessons learned\n`,
  "Doc Projet": `# [Nom du projet]\n\n**Stack:**\n**Date:** ${new Date().toLocaleDateString("fr-FR")}\n**Tags:** projet\n\n---\n\n## Overview\n\n## Architecture\n\n## Features\n- [ ] Feature 1\n- [ ] Feature 2\n\n## Setup\n\n\`\`\`bash\n# Installation\n\`\`\`\n`,
  "Cours Guardia": `# [Matière] — [Chapitre]\n\n**Date:** ${new Date().toLocaleDateString("fr-FR")}\n**Tags:** cours, guardia\n\n---\n\n## Objectifs\n\n## Concepts clés\n\n## Points importants\n\n## Résumé\n`,
  "Pentest Report": `# Rapport Pentest — [Cible]\n\n**Date:** ${new Date().toLocaleDateString("fr-FR")}\n**Testeur:** Alessandro Gagliardi\n**Méthodologie:** OWASP Testing Guide v4.2\n\n---\n\n## Executive Summary\n\n## Vulnérabilités\n\n| ID | Titre | Criticité | CVSS |\n|----|-------|-----------|------|\n| V1 | | Critique | 9.x |\n\n## Conclusion\n`,
};

// ─── Utils ────────────────────────────────────────────────────────────────────

function buildTree(notes: Note[]): FolderNode {
  const root: FolderNode = { name:"root", notes:[], subfolders:{} };
  for (const note of notes) {
    if (note.path.includes("_trash")) continue;
    const parts = note.path.replace(/^notes\//, "").split("/");
    if (parts.length===1) { root.notes.push(note); continue; }
    let node = root;
    for (let i=0; i<parts.length-1; i++) {
      const seg = parts[i];
      if (!node.subfolders[seg]) node.subfolders[seg] = { name:seg, notes:[], subfolders:{} };
      node = node.subfolders[seg];
    }
    node.notes.push(note);
  }
  return root;
}

function extractTags(content: string): string[] {
  const tags: string[] = [];
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (fm) { const m = fm[1].match(/tags:\s*\[([^\]]+)\]/); if (m) tags.push(...m[1].split(",").map((x:string)=>x.trim())); }
  const re = /#([a-zA-Z][a-zA-Z0-9_-]*)/g; let m;
  while ((m=re.exec(content))!==null) if (!tags.includes(m[1])) tags.push(m[1]);
  return tags;
}

function extractHeadings(content: string) {
  const re = /^(#{1,3})\s+(.+)$/gm; const h: {level:number;text:string;id:string}[] = []; let m;
  while ((m=re.exec(content))!==null) h.push({level:m[1].length,text:m[2],id:m[2].toLowerCase().replace(/[^a-z0-9]+/g,"-")});
  return h;
}

function wordCount(text: string) { return text.trim().split(/\s+/).filter(Boolean).length; }
function readTime(text: string) { return Math.max(1,Math.round(wordCount(text)/200)); }

function formatRelativeDate(isoDate: string): string {
  const d = new Date(isoDate);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "à l'instant";
  if (mins < 60) return `il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days}j`;
  return d.toLocaleDateString("fr-FR", {day:"numeric",month:"short"});
}

function HighlightText({ text, query, t }: { text: string; query: string; t: Theme }) {
  if (!query.trim()) return <span>{text}</span>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} style={{background:t.accentBg,color:t.accent,borderRadius:2,padding:"0 1px"}}>{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </span>
  );
}

function insertMd(ref: React.RefObject<HTMLTextAreaElement>, before: string, after="", ph="") {
  const el=ref.current; if(!el) return;
  const s=el.selectionStart, e=el.selectionEnd;
  const sel=el.value.slice(s,e)||ph;
  el.value=el.value.slice(0,s)+before+sel+after+el.value.slice(e);
  el.focus(); el.setSelectionRange(s+before.length,s+before.length+sel.length);
  el.dispatchEvent(new Event("input",{bubbles:true}));
}

function formatSize(bytes: number) {
  if (bytes<1024) return bytes+"B";
  if (bytes<1048576) return (bytes/1024).toFixed(1)+"KB";
  return (bytes/1048576).toFixed(1)+"MB";
}

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext||"")) return <ImageIcon size={15}/>;
  if (["pdf"].includes(ext||"")) return <FileText size={15}/>;
  if (["zip","tar","gz","rar"].includes(ext||"")) return <FileArchive size={15}/>;
  if (["md","txt"].includes(ext||"")) return <StickyNote size={15}/>;
  return <File size={15}/>;
}

function markdownToHtml(md: string, title: string, dark: boolean) {
  const bg=dark?"#0d1117":"#ffffff"; const color=dark?"#e6edf3":"#1f2328";
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:${bg};color:${color};padding:3rem;max-width:860px;margin:auto;line-height:1.8}h1{font-size:2rem;font-weight:700;margin:2rem 0 1rem;border-bottom:1px solid #21262d;padding-bottom:.5rem}h2{font-size:1.5rem;font-weight:600;margin:1.2rem 0 .8rem}h3{font-size:1.1rem;color:#00d4ff;margin:1rem 0 .6rem}p{margin-bottom:1rem}code{background:#161b22;border:1px solid #21262d;padding:.2em .45em;border-radius:4px;font-family:monospace;font-size:.85em;color:#a78bfa}pre{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:1.2rem;overflow-x:auto;margin:1rem 0}pre code{background:none;border:none;color:${color}}ul,ol{padding-left:1.5rem;margin-bottom:1rem}li{margin-bottom:.3rem}blockquote{border-left:3px solid #6e00ff;padding-left:1rem;opacity:.75;font-style:italic;margin:1rem 0}a{color:#00d4ff}table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{border:1px solid #21262d;padding:.6rem 1rem}th{background:#161b22}strong{font-weight:700}hr{border:none;border-top:1px solid #21262d;margin:1.5rem 0}.meta{color:#8b949e;font-size:.85rem;margin-bottom:2rem;padding:.75rem;background:#161b22;border-radius:8px;border:1px solid #21262d}</style></head><body><div class="meta">📄 ${title} · pazent.brain · ${new Date().toLocaleDateString("fr-FR",{year:"numeric",month:"long",day:"numeric"})}</div>${md}</body></html>`;
}

function processWikiLinks(content: string): string {
  return content.replace(/\[\[([^\]]+)\]\]/g, "[$1](note:$1)");
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }: { onAuth:(p:string)=>void }) {
  const [pw,setPw]=useState("");
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0d1117",padding:16}}>
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:32}}>
          <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,#6e00ff,#00d4ff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>🧠</div>
          <div><div style={{fontWeight:700,fontSize:22,color:"#fff"}}>pazent.brain</div><div style={{fontSize:12,color:"#8b949e"}}>knowledge base privée</div></div>
        </div>
        <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:14,padding:24}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}><Lock size={15} color="#6e00ff"/><span style={{fontSize:14,fontWeight:500,color:"#e6edf3"}}>Accès protégé</span></div>
          <input type="password" placeholder="Mot de passe" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onAuth(pw)}
            style={{width:"100%",padding:"12px 14px",background:"#0d1117",border:"1px solid #21262d",borderRadius:10,color:"#e6edf3",fontSize:15,outline:"none",marginBottom:12}} autoFocus/>
          <button onClick={()=>onAuth(pw)} style={{width:"100%",padding:"12px 14px",background:"linear-gradient(135deg,#6e00ff,#5500cc)",border:"none",borderRadius:10,color:"#fff",fontSize:15,fontWeight:600,cursor:"pointer"}}>Entrer →</button>
        </div>
      </div>
    </div>
  );
}

// ─── Drive (Files) ────────────────────────────────────────────────────────────
function DriveView({ t, password }: { t:Theme; password:string }) {
  const [files,setFiles]=useState<GFile[]>([]);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [dragOver,setDragOver]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);

  const fetchFiles=useCallback(async()=>{
    setLoading(true);
    const res=await fetch("/api/files?folder=files");
    const data=await res.json();
    setFiles(Array.isArray(data)?data:[]);
    setLoading(false);
  },[]);

  useEffect(()=>{fetchFiles();},[fetchFiles]);

  async function upload(fileList: FileList|null) {
    if(!fileList||fileList.length===0) return;
    setUploading(true);
    for (const file of Array.from(fileList)) {
      const fd=new FormData();
      fd.append("file",file);
      fd.append("folder","files");
      await fetch("/api/upload",{method:"POST",headers:{"x-app-password":password},body:fd});
    }
    await fetchFiles();
    setUploading(false);
  }

  async function deleteFile(f: GFile) {
    if(!confirm(`Supprimer "${f.name}" ?`)) return;
    const res=await fetch(`https://api.github.com/repos/Pazificateur69/pazent-brain-notes/contents/${f.path}`,{headers:{Authorization:`token ${password}`}});
    const data=await res.json();
    await fetch("/api/files",{method:"DELETE",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path:f.path,sha:data.sha})});
    fetchFiles();
  }

  const images=files.filter(f=>["jpg","jpeg","png","gif","webp","svg"].includes(f.name.split(".").pop()?.toLowerCase()||""));
  const docs=files.filter(f=>!images.includes(f));

  return (
    <div style={{flex:1,overflowY:"auto",padding:"24px 20px"}}>
      <div style={{maxWidth:900,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div><div style={{fontSize:22,fontWeight:700,color:t.text}}>📁 Drive</div><div style={{fontSize:13,color:t.muted}}>{files.length} fichier{files.length!==1?"s":""} · {formatSize(files.reduce((a,f)=>a+f.size,0))}</div></div>
          <button onClick={()=>fileRef.current?.click()} disabled={uploading}
            style={{display:"flex",alignItems:"center",gap:8,padding:"10px 18px",background:t.accent,border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer",opacity:uploading?.7:1}}>
            <Upload size={15}/>{uploading?"Upload...":"Uploader"}
          </button>
          <input ref={fileRef} type="file" multiple style={{display:"none"}} onChange={e=>upload(e.target.files)}/>
        </div>
        <div
          onDragOver={e=>{e.preventDefault();setDragOver(true);}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);upload(e.dataTransfer.files);}}
          style={{border:`2px dashed ${dragOver?t.accent:t.border}`,borderRadius:12,padding:"28px 20px",textAlign:"center",background:dragOver?t.accentBg:"none",marginBottom:20,cursor:"pointer",transition:"all .2s"}}
          onClick={()=>fileRef.current?.click()}>
          <Upload size={24} color={dragOver?t.accent:t.muted} style={{margin:"0 auto 8px"}}/>
          <div style={{fontSize:14,color:dragOver?t.accent:t.muted}}>Glisse des fichiers ici ou clique pour uploader</div>
          <div style={{fontSize:12,color:t.muted,marginTop:4}}>PDF, images, documents, archives...</div>
        </div>
        {loading && <div style={{color:t.muted,fontSize:14,textAlign:"center",padding:32}}>Chargement...</div>}
        {images.length>0&&(
          <div style={{marginBottom:24}}>
            <div style={{fontSize:12,fontWeight:600,color:t.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>🖼️ Images ({images.length})</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
              {images.map(f=>(
                <div key={f.path} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,overflow:"hidden",position:"relative"}}>
                  <img src={f.download_url} alt={f.name} style={{width:"100%",height:100,objectFit:"cover"}}/>
                  <div style={{padding:"8px 10px"}}>
                    <div style={{fontSize:11,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                    <div style={{fontSize:10,color:t.muted}}>{formatSize(f.size)}</div>
                  </div>
                  <div style={{position:"absolute",top:6,right:6,display:"flex",gap:4}}>
                    <a href={f.download_url} download style={{padding:"4px",background:"#00000088",borderRadius:5,color:"#fff",display:"flex"}}><Download size={11}/></a>
                    <button onClick={()=>deleteFile(f)} style={{padding:"4px",background:"#00000088",border:"none",borderRadius:5,color:"#fff",cursor:"pointer",display:"flex"}}><Trash2 size={11}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {docs.length>0&&(
          <div>
            <div style={{fontSize:12,fontWeight:600,color:t.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>📄 Documents ({docs.length})</div>
            <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,overflow:"hidden"}}>
              {docs.map((f,i)=>(
                <div key={f.path} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<docs.length-1?`1px solid ${t.border}`:"none"}}>
                  <div style={{color:t.muted,flexShrink:0}}>{fileIcon(f.name)}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                    <div style={{fontSize:11,color:t.muted}}>{formatSize(f.size)} · {f.path.split("/").slice(0,-1).join("/")}</div>
                  </div>
                  <div style={{display:"flex",gap:6,flexShrink:0}}>
                    <a href={f.download_url} download style={{padding:"6px 10px",background:t.surface2,border:`1px solid ${t.border}`,borderRadius:7,color:t.text,fontSize:12,display:"flex",alignItems:"center",gap:5,textDecoration:"none"}}>
                      <Download size={12}/> Télécharger
                    </a>
                    <button onClick={()=>deleteFile(f)} style={{padding:"6px 8px",background:"none",border:`1px solid ${t.border}`,borderRadius:7,color:t.muted,cursor:"pointer"}}
                      onMouseEnter={e=>{e.currentTarget.style.color="#ff4444";e.currentTarget.style.borderColor="#ff444444";}}
                      onMouseLeave={e=>{e.currentTarget.style.color=t.muted;e.currentTarget.style.borderColor=t.border;}}>
                      <Trash2 size={12}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {!loading&&files.length===0&&(
          <div style={{textAlign:"center",padding:"40px 0",color:t.muted}}>
            <HardDrive size={40} style={{margin:"0 auto 12px",opacity:.3}}/>
            <div>Aucun fichier. Uploade quelque chose !</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Trash View ────────────────────────────────────────────────────────────────
function TrashView({ trashNotes, t, onRestore, onDeletePermanently }: {
  trashNotes: Note[];
  t: Theme;
  onRestore: (note: Note) => void;
  onDeletePermanently: (note: Note) => void;
}) {
  return (
    <div style={{flex:1,overflowY:"auto",padding:"24px 20px"}}>
      <div style={{maxWidth:900,margin:"0 auto"}}>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:22,fontWeight:700,color:t.text,marginBottom:4}}>🗑️ Corbeille</div>
          <div style={{fontSize:13,color:t.muted}}>{trashNotes.length} note{trashNotes.length!==1?"s":""} dans la corbeille</div>
        </div>
        {trashNotes.length===0?(
          <div style={{textAlign:"center",padding:"60px 0",color:t.muted}}>
            <div style={{fontSize:48,marginBottom:12}}>🗑️</div>
            <div>La corbeille est vide</div>
          </div>
        ):(
          <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,overflow:"hidden"}}>
            {trashNotes.map((note,i)=>(
              <div key={note.path} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<trashNotes.length-1?`1px solid ${t.border}`:"none"}}>
                <FileText size={15} color={t.muted} style={{flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {note.path.split("/").pop()?.replace(".md","")}
                  </div>
                  <div style={{fontSize:11,color:t.muted}}>{note.path.replace(/^notes\/_trash\//,"notes/")}</div>
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={()=>onRestore(note)}
                    style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",background:t.accentBg,border:`1px solid ${t.accent}44`,borderRadius:7,color:t.accent,fontSize:12,fontWeight:600,cursor:"pointer"}}>
                    <RotateCcw size={12}/> Restaurer
                  </button>
                  <button onClick={()=>onDeletePermanently(note)}
                    style={{padding:"6px 8px",background:"none",border:`1px solid ${t.border}`,borderRadius:7,color:t.muted,cursor:"pointer"}}
                    onMouseEnter={e=>{e.currentTarget.style.color="#ff4444";e.currentTarget.style.borderColor="#ff444444";}}
                    onMouseLeave={e=>{e.currentTarget.style.color=t.muted;e.currentTarget.style.borderColor=t.border;}}>
                    <Trash2 size={12}/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ notes, favorites, t, onOpenNote, onNavigate, streak, modifiedDates, onExportZip, exportingZip }: {
  notes: Note[];
  favorites: string[];
  t: Theme;
  onOpenNote: (n: Note) => void;
  onNavigate: (view: "notes"|"drive"|"trash") => void;
  streak: number;
  modifiedDates: Record<string, string>;
  onExportZip: () => void;
  exportingZip: boolean;
}) {
  const nonTrash = notes.filter(n=>!n.path.includes("_trash"));
  const totalWords = nonTrash.reduce((a,n)=>a+wordCount(n.content||""),0);
  const allTags = [...new Set(nonTrash.flatMap(n=>extractTags(n.content||"")))];
  const favNotes = nonTrash.filter(n=>favorites.includes(n.path));

  const recentNotes = [...nonTrash].sort((a,b)=>{
    const da = modifiedDates[a.path]||"0";
    const db = modifiedDates[b.path]||"0";
    return db.localeCompare(da);
  }).slice(0,5);

  const stats = [
    {label:"Notes",value:nonTrash.length,icon