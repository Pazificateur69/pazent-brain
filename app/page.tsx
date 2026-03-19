"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import JSZip from "jszip";
import {
  FileText, FolderOpen, Folder, Plus, Search, Save, Trash2, Eye, Edit3,
  ChevronRight, ChevronDown, Download, Code, Hash, AlignLeft, Clock,
  Bold, Italic, Link2, X, Check, Star, RefreshCw, Columns, Maximize2,
  Minimize2, History, Tag, List as ListIcon, Keyboard, Lock, BarChart2,
  Zap, RotateCcw, Upload, File, Image as ImageIcon, FileArchive, Menu,
  ArrowLeft, HardDrive, StickyNote, Settings
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface Note { path: string; name: string; content?: string; sha?: string; }
interface GFile { name: string; path: string; type: string; size: number; download_url: string; }
interface FolderNode { name: string; notes: Note[]; subfolders: Record<string, FolderNode>; }

const PASSWORD_KEY = "pazent_brain_auth";
const FAVS_KEY = "pazent_brain_favs";
const THEME_KEY = "pazent_brain_theme";
const WRAP_KEY = "pazent_brain_wrap";
const AUTOSAVE_KEY = "pazent_brain_autosave";

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

        {/* Drop zone */}
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

        {/* Images grid */}
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

        {/* Docs list */}
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

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ notes, favorites, t, onOpenNote }: { notes:Note[]; favorites:string[]; t:Theme; onOpenNote:(n:Note)=>void }) {
  const totalWords=notes.reduce((a,n)=>a+wordCount(n.content||""),0);
  const allTags=[...new Set(notes.flatMap(n=>extractTags(n.content||"")))];
  const favNotes=notes.filter(n=>favorites.includes(n.path));
  return (
    <div style={{flex:1,overflowY:"auto",padding:"24px 20px"}}>
      <div style={{maxWidth:900,margin:"0 auto"}}>
        <div style={{marginBottom:24}}>
          <div style={{fontSize:24,fontWeight:700,color:t.text,marginBottom:4}}>Bonjour AL 👋</div>
          <div style={{fontSize:13,color:t.muted}}>{new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:24}}>
          {[{label:"Notes",value:notes.length,icon:"📄"},{label:"Mots",value:totalWords.toLocaleString(),icon:"✍️"},{label:"Tags",value:allTags.length,icon:"🏷️"},{label:"Favoris",value:favNotes.length,icon:"⭐"}].map(s=>(
            <div key={s.label} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:16,textAlign:"center"}}>
              <div style={{fontSize:24,marginBottom:6}}>{s.icon}</div>
              <div style={{fontSize:20,fontWeight:700,color:t.text}}>{s.value}</div>
              <div style={{fontSize:12,color:t.muted}}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14,marginBottom:16}}>
          <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:16}}>
            <div style={{fontSize:12,fontWeight:600,color:t.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:12}}>📝 Notes récentes</div>
            {notes.slice(0,5).map(n=>(
              <button key={n.path} onClick={()=>onOpenNote(n)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"6px 0",background:"none",border:"none",borderBottom:`1px solid ${t.border}22`,cursor:"pointer",textAlign:"left"}}>
                <FileText size={12} color={t.muted}/>
                <span style={{fontSize:13,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{n.path.split("/").pop()?.replace(".md","")}</span>
                <span style={{fontSize:11,color:t.muted,flexShrink:0}}>{n.path.includes("/")?n.path.split("/").slice(-2,-1)[0]:""}</span>
              </button>
            ))}
            {notes.length===0&&<div style={{fontSize:13,color:t.muted}}>Aucune note</div>}
          </div>
          <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:16}}>
            <div style={{fontSize:12,fontWeight:600,color:t.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:12}}>⭐ Favoris</div>
            {favNotes.slice(0,5).map(n=>(
              <button key={n.path} onClick={()=>onOpenNote(n)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"6px 0",background:"none",border:"none",borderBottom:`1px solid ${t.border}22`,cursor:"pointer",textAlign:"left"}}>
                <Star size={12} color="#f0b429" fill="#f0b429"/>
                <span style={{fontSize:13,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.path.split("/").pop()?.replace(".md","")}</span>
              </button>
            ))}
            {favNotes.length===0&&<div style={{fontSize:13,color:t.muted}}>Aucun favori encore</div>}
          </div>
        </div>
        {allTags.length>0&&(
          <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:16}}>
            <div style={{fontSize:12,fontWeight:600,color:t.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>🏷️ Tags</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {allTags.map(tag=>(
                <span key={tag} style={{padding:"3px 10px",borderRadius:20,fontSize:12,background:t.accentBg,color:t.accent,border:`1px solid ${t.accent}33`}}>#{tag}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────
function ShortcutsModal({ t, onClose }: { t:Theme; onClose:()=>void }) {
  const s=[["Ctrl+S","Sauvegarder"],["Ctrl+P","Preview"],["Ctrl+D","Split"],["F11","Focus"],["Ctrl+K","Quick capture"],["?","Raccourcis"],["Esc","Fermer"]];
  return (
    <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:24,width:"100%",maxWidth:360}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8,fontWeight:600,color:t.text}}><Keyboard size={16} color={t.accent}/> Raccourcis</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:t.muted,cursor:"pointer"}}><X size={16}/></button>
        </div>
        {s.map(([k,d])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${t.border}22`}}>
            <span style={{fontSize:13,color:t.muted}}>{d}</span>
            <kbd style={{background:t.surface2,border:`1px solid ${t.border}`,borderRadius:5,padding:"2px 8px",fontSize:12,color:t.text,fontFamily:"monospace"}}>{k}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryModal({ note, t, onRestore, onClose }: { note:Note; t:Theme; onRestore:(c:string)=>void; onClose:()=>void }) {
  const [commits,setCommits]=useState<{sha:string;message:string;date:string}[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [preview,setPreview]=useState<string|null>(null);
  useEffect(()=>{ fetch(`/api/history?path=${encodeURIComponent(note.path)}`).then(r=>r.json()).then(setCommits); },[note.path]);
  async function loadVersion(sha:string) { setSelected(sha); const r=await fetch(`/api/file-at-commit?path=${encodeURIComponent(note.path)}&sha=${sha}`); const d=await r.json(); setPreview(d.content||""); }
  return (
    <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,width:"100%",maxWidth:700,maxHeight:"85vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:`1px solid ${t.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:8,fontWeight:600,color:t.text}}><History size={16} color={t.accent}/> Historique — {note.name}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:t.muted,cursor:"pointer"}}><X size={16}/></button>
        </div>
        <div style={{display:"flex",flex:1,overflow:"hidden",flexDirection:"column"}}>
          <div style={{display:"flex",flex:1,overflow:"hidden"}}>
            <div style={{width:220,minWidth:220,borderRight:`1px solid ${t.border}`,overflowY:"auto"}}>
              {commits.length===0&&<div style={{padding:16,color:t.muted,fontSize:13}}>Chargement...</div>}
              {commits.map(c=>(
                <button key={c.sha} onClick={()=>loadVersion(c.sha)}
                  style={{display:"block",width:"100%",padding:"10px 14px",textAlign:"left",background:selected===c.sha?t.accentBg:"none",border:"none",borderBottom:`1px solid ${t.border}22`,cursor:"pointer"}}>
                  <div style={{fontSize:12,color:t.text,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.message}</div>
                  <div style={{fontSize:11,color:t.muted}}>{new Date(c.date).toLocaleDateString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
                </button>
              ))}
            </div>
            <div style={{flex:1,padding:16,overflowY:"auto"}}>
              {preview===null?<div style={{color:t.muted,fontSize:13,paddingTop:16}}>← Sélectionne une version</div>:(
                <>
                  <button onClick={()=>{onRestore(preview);onClose();}} style={{display:"flex",alignItems:"center",gap:6,marginBottom:12,padding:"6px 12px",background:t.accent,border:"none",borderRadius:7,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                    <RotateCcw size={12}/> Restaurer
                  </button>
                  <pre style={{fontSize:12,color:t.muted,whiteSpace:"pre-wrap",lineHeight:1.6}}>{preview}</pre>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickCapture({ t, folders, password, onCreated, onClose }: { t:Theme; folders:string[]; password:string; onCreated:(n:Note)=>void; onClose:()=>void }) {
  const [name,setName]=useState(""); const [text,setText]=useState(""); const [folder,setFolder]=useState("notes");
  async function capture() {
    if(!name.trim()) return;
    const slug=name.trim().replace(/ /g,"-").toLowerCase();
    const path=`${folder}/${slug}.md`;
    await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path,content:text.trim()?`# ${name}\n\n${text}`:`# ${name}\n\n`})});
    onCreated({path,name:name.trim()}); onClose();
  }
  return (
    <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:80,padding:"80px 16px 16px"}} onClick={onClose}>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,width:"100%",maxWidth:520,padding:20,boxShadow:`0 20px 60px ${t.shadowColor}`}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <Zap size={16} color={t.accent}/><span style={{fontWeight:600,fontSize:14,color:t.text}}>Capture rapide</span>
          <button onClick={onClose} style={{marginLeft:"auto",background:"none",border:"none",color:t.muted,cursor:"pointer"}}><X size={14}/></button>
        </div>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="Titre..." autoFocus onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&capture()}
          style={{width:"100%",padding:"10px 14px",background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:14,outline:"none",marginBottom:10}}/>
        <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Contenu (optionnel)..." rows={3}
          style={{width:"100%",padding:"10px 14px",background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:13,outline:"none",resize:"none",fontFamily:"'JetBrains Mono',monospace",marginBottom:10}}/>
        <div style={{display:"flex",gap:8}}>
          <select value={folder} onChange={e=>setFolder(e.target.value)} style={{flex:1,background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:8,color:t.muted,fontSize:13,padding:"8px 12px",outline:"none"}}>
            <option value="notes">📄 Racine</option>
            {folders.map(f=><option key={f} value={`notes/${f}`}>📁 {f}</option>)}
          </select>
          <button onClick={capture} style={{padding:"8px 20px",background:t.accent,border:"none",borderRadius:8,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>⚡ Créer</button>
        </div>
      </div>
    </div>
  );
}

// ─── Note Row ─────────────────────────────────────────────────────────────────
function NoteRow({ note, active, favorites, t, onToggleFav, onClick, onRename, onDragStart }: { note:Note; active:Note|null; favorites:string[]; t:Theme; onToggleFav:(p:string)=>void; onClick:()=>void; onRename:()=>void; onDragStart?:(n:Note)=>void }) {
  const isActive=active?.path===note.path, isFav=favorites.includes(note.path);
  const [hov,setHov]=useState(false);
  const name=note.path.split("/").pop()?.replace(".md","")||note.name;
  return (
    <div style={{display:"flex",alignItems:"center",marginBottom:1}} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
      <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:7,flex:1,padding:"6px 8px",background:isActive?t.accentBg:"none",border:`1px solid ${isActive?t.accent+"33":"transparent"}`,borderRadius:8,color:isActive?"#a78bfa":t.text,fontSize:13,cursor:"pointer",textAlign:"left",minWidth:0}}
        onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background=t.hoverBg;}} onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background="none";}}>
        <FileText size={12} color={isActive?t.accent:t.muted} style={{flexShrink:0}}/>
        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{name}</span>
      </button>
      {(hov||isFav)&&<button onClick={e=>{e.stopPropagation();onToggleFav(note.path);}} style={{padding:"4px 5px",background:"none",border:"none",cursor:"pointer",color:isFav?"#f0b429":t.muted,flexShrink:0}}><Star size={11} fill={isFav?"#f0b429":"none"}/></button>}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Brain() {
  const [notes,setNotes]=useState<Note[]>([]);
  const [active,setActive]=useState<Note|null>(null);
  const [view,setView]=useState<"dashboard"|"notes"|"drive"|"trash">("dashboard");
  const [content,setContent]=useState("");
  const [originalContent,setOriginalContent]=useState("");
  const [editorMode,setEditorMode]=useState<"edit"|"preview"|"split">("edit");
  const [search,setSearch]=useState("");
  const [searchResults,setSearchResults]=useState<{note:Note;excerpt:string}[]|null>(null);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [creating,setCreating]=useState(false);
  const [newNoteName,setNewNoteName]=useState("");
  const [newNoteFolder,setNewNoteFolder]=useState("notes");
  const [selectedTemplate,setSelectedTemplate]=useState("");
  const [renaming,setRenaming]=useState<Note|null>(null);
  const [renameTo,setRenameTo]=useState("");
  const [password,setPassword]=useState("");
  const [authed,setAuthed]=useState(false);
  const [loading,setLoading]=useState(true);
  const [darkMode,setDarkMode]=useState(true);
  const [expandedFolders,setExpandedFolders]=useState<Set<string>>(new Set(["cybersec","projets","cours","ressources"]));
  const [favorites,setFavorites]=useState<string[]>([]);
  const [activeTag,setActiveTag]=useState<string|null>(null);
  const [showDownload,setShowDownload]=useState(false);
  const [showHistory,setShowHistory]=useState(false);
  const [showShortcuts,setShowShortcuts]=useState(false);
  const [showTOC,setShowTOC]=useState(false);
  const [showQuickCapture,setShowQuickCapture]=useState(false);
  const [focusMode,setFocusMode]=useState(false);
  const [dragOver,setDragOver]=useState<string|null>(null);
  const [dragNote,setDragNote]=useState<Note|null>(null);
  const [newFolderName,setNewFolderName]=useState("");
  const [creatingFolder,setCreatingFolder]=useState<string|null>(null);
  const [showShare,setShowShare]=useState(false);
  const [shareUrl,setShareUrl]=useState<string|null>(null);
  const [sharing,setSharing]=useState(false);
  const [showCommandPalette,setShowCommandPalette]=useState(false);
  const [pasteUploading,setPasteUploading]=useState(false);
  const [wordWrap,setWordWrap]=useState(true);
  const [autoSave,setAutoSave]=useState(true);
  const [autoSaving,setAutoSaving]=useState(false);
  const [trashNotes,setTrashNotes]=useState<Note[]>([]);
  const [wikiSuggest,setWikiSuggest]=useState<{notes:Note[];query:string;pos:number}|null>(null);
  const [sidebarOpen,setSidebarOpen]=useState(true);
  const [isMobile,setIsMobile]=useState(false);
  const textareaRef=useRef<HTMLTextAreaElement>(null);

  const t=darkMode?DARK:LIGHT;

  useEffect(()=>{
    const check=()=>setIsMobile(window.innerWidth<768);
    check(); window.addEventListener("resize",check);
    return ()=>window.removeEventListener("resize",check);
  },[]);

  useEffect(()=>{
    if(isMobile) setSidebarOpen(false);
    else setSidebarOpen(true);
  },[isMobile]);

  useEffect(()=>{
    const s=sessionStorage.getItem(PASSWORD_KEY);
    if(s){setPassword(s);setAuthed(true);}
    try{const f=localStorage.getItem(FAVS_KEY);if(f)setFavorites(JSON.parse(f));}catch{}
    // Register PWA service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(()=>{});
    }
    const th=localStorage.getItem(THEME_KEY);
    setDarkMode(th!=="light");
    const wrap=localStorage.getItem(WRAP_KEY);
    if(wrap!==null) setWordWrap(wrap==="true");
    const as=localStorage.getItem(AUTOSAVE_KEY);
    if(as!==null) setAutoSave(as==="true");
    setLoading(false);
  },[]);

  const fetchNotes=useCallback(async()=>{
    const res=await fetch("/api/notes");
    const data=await res.json();
    setNotes(Array.isArray(data)?data:[]);
  },[]);

  const fetchTrash=useCallback(async()=>{
    const res=await fetch("/api/notes");
    const data=await res.json();
    setTrashNotes(Array.isArray(data)?data.filter((n:Note)=>n.path.includes("_trash")):[]);
  },[]);

  useEffect(()=>{if(authed){fetchNotes();fetchTrash();}},[authed,fetchNotes,fetchTrash]);

  function handleAuth(pw:string){sessionStorage.setItem(PASSWORD_KEY,pw);setPassword(pw);setAuthed(true);}
  function toggleTheme(){const n=!darkMode;setDarkMode(n);localStorage.setItem(THEME_KEY,n?"dark":"light");}

  function toggleWordWrap(){const n=!wordWrap;setWordWrap(n);localStorage.setItem(WRAP_KEY,String(n));}
  function toggleAutoSave(){const n=!autoSave;setAutoSave(n);localStorage.setItem(AUTOSAVE_KEY,String(n));}

  async function exportAllNotes(){
    const zip=new JSZip();
    const folder=zip.folder("pazent-brain-notes");
    for(const note of notes){
      try{
        const res=await fetch(`/api/notes?path=${encodeURIComponent(note.path)}`);
        const data=await res.json();
        if(data.content) folder?.file(note.path.replace(/^notes\//,""),data.content);
      }catch{}
    }
    const blob=await zip.generateAsync({type:"blob"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=`pazent-brain-export-${new Date().toISOString().slice(0,10)}.zip`;
    a.click();
  }

  async function shareNote(){
    if(!active)return;
    setSharing(true);
    const res=await fetch("/api/share",{method:"POST",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path:active.path,title:active.name,content})});
    const data=await res.json();
    const fullUrl=`${window.location.origin}${data.url}`;
    setShareUrl(fullUrl);
    setSharing(false);
    setShowShare(true);
    try{await navigator.clipboard.writeText(fullUrl);}catch{}
  }

  async function handlePaste(e:React.ClipboardEvent<HTMLTextAreaElement>){
    const items=Array.from(e.clipboardData.items);
    const imageItem=items.find(i=>i.type.startsWith("image/"));
    if(!imageItem||!active)return;
    e.preventDefault();
    setPasteUploading(true);
    const file=imageItem.getAsFile();
    if(!file)return;
    const fd=new FormData();
    fd.append("file", file);
    fd.append("folder","files/images");
    const res=await fetch("/api/upload",{method:"POST",headers:{"x-app-password":password},body:fd});
    const data=await res.json();
    if(data.url){
      const md=`
![image](${data.url})
`;
      const el=textareaRef.current;
      if(el){const pos=el.selectionStart;el.value=el.value.slice(0,pos)+md+el.value.slice(pos);el.dispatchEvent(new Event("input",{bubbles:true}));setContent(el.value);}
    }
    setPasteUploading(false);
  }

  async function restoreNote(note:Note){
    const res=await fetch(`/api/notes?path=${encodeURIComponent(note.path)}`);
    const data=await res.json();
    const newPath=note.path.replace("_trash/","");
    await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path:newPath,content:data.content||""})});
    await fetch("/api/notes",{method:"DELETE",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path:note.path,sha:data.sha})});
    fetchNotes();fetchTrash();
  }

  async function deleteForever(note:Note){
    if(!confirm(`Supprimer définitivement "${note.name}" ?`))return;
    const res=await fetch(`/api/notes?path=${encodeURIComponent(note.path)}`);
    const data=await res.json();
    await fetch("/api/notes",{method:"DELETE",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path:note.path,sha:data.sha})});
    fetchTrash();
  }

  async function openNote(note:Note){
    const res=await fetch(`/api/notes?path=${encodeURIComponent(note.path)}`);
    const data=await res.json();
    setActive(data);setContent(data.content||"");setOriginalContent(data.content||"");
    setView("notes");setShowDownload(false);setSearchResults(null);setSearch("");
    if(isMobile)setSidebarOpen(false);
  }

  async function saveNote(){
    if(!active||saving)return;
    setSaving(true);
    await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path:active.path,content,sha:active.sha})});
    const updated=await fetch(`/api/notes?path=${encodeURIComponent(active.path)}`).then(r=>r.json());
    setActive(updated);setOriginalContent(content);setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),2500);
  }

  async function trashNote(){
    if(!active||!confirm(`Mettre "${active.name}" à la corbeille ?`))return;
    const trashPath=active.path.replace(/^notes\//,"notes/_trash/");
    await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path:trashPath,content})});
    await fetch("/api/notes",{method:"DELETE",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path:active.path,sha:active.sha})});
    setActive(null);setContent("");fetchNotes();
  }

  async function createNote(){
    if(!newNoteName.trim())return;
    const slug=newNoteName.trim().replace(/ /g,"-").toLowerCase();
    const path=`${newNoteFolder}/${slug}.md`;
    const initial=selectedTemplate?TEMPLATES[selectedTemplate]:`# ${newNoteName.trim()}\n\n`;
    await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path,content:initial})});
    setNewNoteName("");setCreating(false);setSelectedTemplate("");
    await fetchNotes();await openNote({path,name:newNoteName.trim()});
  }

  async function renameNote(){
    if(!renaming||!renameTo.trim())return;
    const parts=renaming.path.split("/");parts[parts.length-1]=renameTo.trim().replace(/ /g,"-").toLowerCase()+".md";
    const newPath=parts.join("/");
    await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path:newPath,content:renaming.content||""})});
    if(renaming.sha)await fetch("/api/notes",{method:"DELETE",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path:renaming.path,sha:renaming.sha})});
    setRenaming(null);setRenameTo("");fetchNotes();
    if(active?.path===renaming.path)openNote({path:newPath,name:renameTo.trim()});
  }

  function toggleFav(path:string){const n=favorites.includes(path)?favorites.filter(f=>f!==path):[...favorites,path];setFavorites(n);localStorage.setItem(FAVS_KEY,JSON.stringify(n));}

  async function moveNote(note: Note, targetFolder: string) {
    const filename = note.path.split("/").pop() || "";
    const newPath = targetFolder ? `${targetFolder}/${filename}` : `notes/${filename}`;
    if (newPath === note.path) return;
    await fetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-password": password },
      body: JSON.stringify({ oldPath: note.path, newPath }),
    });
    fetchNotes();
    if (active?.path === note.path) openNote({ path: newPath, name: note.name });
  }

  async function createFolder(parentPath: string, name: string) {
    const folderPath = parentPath ? `${parentPath}/${name}` : `notes/${name}`;
    await fetch("/api/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-app-password": password },
      body: JSON.stringify({ path: folderPath }),
    });
    fetchNotes();
    setCreatingFolder(null);
    setNewFolderName("");
    // Auto-expand the new folder
    setExpandedFolders(prev => new Set([...prev, name]));
  }

  async function doSearch(query:string){
    if(!query.trim()){setSearchResults(null);return;}
    const results:{note:Note;excerpt:string}[]=[];
    for(const note of notes){
      if(note.name.toLowerCase().includes(query.toLowerCase())){results.push({note,excerpt:`📄 ${note.name}`});continue;}
      try{const r=await fetch(`/api/notes?path=${encodeURIComponent(note.path)}`);const d=await r.json();
        if(d.content?.toLowerCase().includes(query.toLowerCase())){const idx=d.content.toLowerCase().indexOf(query.toLowerCase());const start=Math.max(0,idx-60);results.push({note,excerpt:"..."+d.content.slice(start,idx+query.length+60)+"..."});}}catch{}
    }
    setSearchResults(results);
  }

  function downloadMd(){if(!active)return;const b=new Blob([content],{type:"text/markdown"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`${active.name}.md`;a.click();}
  function downloadHtml(){if(!active)return;const b=new Blob([markdownToHtml(content,active.name,darkMode)],{type:"text/html"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`${active.name}.html`;a.click();}
  function downloadTxt(){if(!active)return;const b=new Blob([content],{type:"text/plain"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`${active.name}.txt`;a.click();}
  function printPdf(){if(!active)return;const w=window.open("","_blank");if(!w)return;w.document.write(markdownToHtml(content,active.name,darkMode));w.document.close();w.onload=()=>w.print();}

  useEffect(()=>{
    function onKey(e:KeyboardEvent){
      if((e.ctrlKey||e.metaKey)&&e.key==="s"){e.preventDefault();saveNote();}
      if((e.ctrlKey||e.metaKey)&&e.key==="p"){e.preventDefault();setEditorMode(v=>v==="preview"?"edit":"preview");}
      if((e.ctrlKey||e.metaKey)&&e.key==="d"){e.preventDefault();setEditorMode(v=>v==="split"?"edit":"split");}
      if((e.ctrlKey||e.metaKey)&&e.key==="k"){e.preventDefault();setShowCommandPalette(true);}
      if(e.key==="F11"){e.preventDefault();setFocusMode(v=>!v);}
      if(e.key==="Escape"){setShowDownload(false);setCreating(false);setShowHistory(false);setShowShortcuts(false);setShowQuickCapture(false);setRenaming(null);if(focusMode)setFocusMode(false);}
      if(e.key==="?"&&!["INPUT","TEXTAREA"].includes((e.target as Element).tagName))setShowShortcuts(true);
    }
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  });

  // Auto-save debounce
  useEffect(()=>{
    if(!autoSave||!active||content===originalContent)return;
    const timer=setTimeout(async()=>{
      if(content===originalContent)return;
      setAutoSaving(true);
      await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path:active.path,content,sha:active.sha})});
      const updated=await fetch(`/api/notes?path=${encodeURIComponent(active.path)}`).then(r=>r.json());
      setActive(updated);setOriginalContent(content);setAutoSaving(false);
    },2000);
    return()=>clearTimeout(timer);
  },[content,active,originalContent,autoSave,password]);

  const isDirty=content!==originalContent;
  const tree=buildTree(notes);
  const folders=Object.keys(tree.subfolders);
  const allTags=[...new Set(notes.flatMap(n=>extractTags(n.content||"")))];
  const favNotes=notes.filter(n=>favorites.includes(n.path));
  const headings=active?extractHeadings(content):[];

  if(loading)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0d1117",color:"#8b949e",fontSize:14}}>chargement...</div>;
  if(!authed)return<AuthScreen onAuth={handleAuth}/>;

  const displayNotes=searchResults!==null?searchResults.map(r=>r.note):activeTag?notes.filter(n=>extractTags(n.content||"").includes(activeTag)):null;

  return (
    <div className={darkMode?"":"light"} style={{display:"flex",height:"100vh",background:t.bg,color:t.text,fontFamily:"'Inter',sans-serif",overflow:"hidden",position:"relative"}}>

      {/* Mobile overlay */}
      {isMobile&&sidebarOpen&&<div style={{position:"fixed",inset:0,background:"#00000066",zIndex:40}} onClick={()=>setSidebarOpen(false)}/>}

      {/* ── Sidebar ── */}
      <aside style={{
        width:260,minWidth:260,background:t.bg,borderRight:`1px solid ${t.border}`,
        display:"flex",flexDirection:"column",overflow:"hidden",
        position:isMobile?"fixed":"relative",
        left:isMobile?(sidebarOpen?0:-260):"auto",
        top:isMobile?0:"auto",height:isMobile?"100vh":"auto",
        zIndex:isMobile?50:1,
        transition:"left .25s ease",
        boxShadow:isMobile&&sidebarOpen?`4px 0 20px ${t.shadowColor}`:"none"
      }}>
        {/* Logo */}
        <div style={{padding:"14px 16px 12px",borderBottom:`1px solid ${t.border}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#6e00ff,#00d4ff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>🧠</div>
            <div><div style={{fontWeight:700,fontSize:14,color:t.text,letterSpacing:"-0.3px"}}>pazent.brain</div><div style={{fontSize:11,color:t.muted}}>{notes.length} notes</div></div>
            <div style={{marginLeft:"auto",display:"flex",gap:2}}>
              <button onClick={toggleTheme} style={{background:"none",border:"none",cursor:"pointer",color:t.muted,padding:4,borderRadius:4}}>{darkMode?"☀️":"🌙"}</button>
              <button onClick={fetchNotes} style={{background:"none",border:"none",cursor:"pointer",color:t.muted,padding:4,borderRadius:4}}><RefreshCw size={12}/></button>
            </div>
          </div>
        </div>

        {/* Nav tabs */}
        <div style={{display:"flex",padding:"8px 10px",gap:4,borderBottom:`1px solid ${t.border}`,flexShrink:0}}>
          {([["dashboard","📊","Dashboard"],["notes","📝","Notes"],["drive","📁","Drive"],["trash","🗑️","Corbeille"]] as const).map(([v,icon,label])=>(
            <button key={v} onClick={()=>{setView(v);if(isMobile)setSidebarOpen(false);}}
              style={{flex:1,padding:"6px 4px",background:view===v?t.accentBg:"none",border:`1px solid ${view===v?t.accent+"44":t.border}`,borderRadius:7,color:view===v?t.accent:t.muted,fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <span style={{fontSize:14}}>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>

        {/* Search (notes only) */}
        {view==="notes"&&(
          <div style={{padding:"8px 12px 4px",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:8}}>
              <Search size={13} color={t.muted}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSearch(search)}
                placeholder="Chercher (Entrée=full text)"
                style={{background:"none",border:"none",outline:"none",color:t.text,fontSize:13,width:"100%"}}/>
              {search&&<button onClick={()=>{setSearch("");setSearchResults(null);}} style={{background:"none",border:"none",cursor:"pointer",color:t.muted,padding:0}}><X size={12}/></button>}
            </div>
          </div>
        )}

        {/* New note (notes only) */}
        {view==="notes"&&(
          <div style={{padding:"4px 12px 8px",flexShrink:0}}>
            {creating?(
              <div style={{background:t.surface,border:`1px solid ${t.accent}44`,borderRadius:8,padding:10}}>
                <input value={newNoteName} onChange={e=>setNewNoteName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createNote()}
                  placeholder="Nom de la note..." autoFocus
                  style={{width:"100%",background:"none",border:"none",outline:"none",color:t.text,fontSize:13,marginBottom:8}}/>
                <select value={newNoteFolder} onChange={e=>setNewNoteFolder(e.target.value)}
                  style={{width:"100%",background:t.bg,border:`1px solid ${t.border}`,borderRadius:6,color:t.muted,fontSize:12,padding:"4px 8px",marginBottom:6,outline:"none"}}>
                  <option value="notes">📄 Racine</option>
                  {folders.map(f=><option key={f} value={`notes/${f}`}>📁 {f}</option>)}
                </select>
                <select value={selectedTemplate} onChange={e=>setSelectedTemplate(e.target.value)}
                  style={{width:"100%",background:t.bg,border:`1px solid ${t.border}`,borderRadius:6,color:t.muted,fontSize:12,padding:"4px 8px",marginBottom:8,outline:"none"}}>
                  <option value="">Pas de template</option>
                  {Object.keys(TEMPLATES).map(tpl=><option key={tpl} value={tpl}>{tpl}</option>)}
                </select>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={createNote} style={{flex:1,padding:"6px 0",background:t.accent,border:"none",borderRadius:6,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>Créer</button>
                  <button onClick={()=>setCreating(false)} style={{padding:"6px 10px",background:t.surface2,border:"none",borderRadius:6,color:t.muted,fontSize:12,cursor:"pointer"}}>✕</button>
                </div>
              </div>
            ):(
              <button onClick={()=>setCreating(true)}
                style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"7px 10px",background:"none",border:`1px dashed ${t.border}`,borderRadius:8,color:t.muted,fontSize:13,cursor:"pointer"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=t.accent+"44";e.currentTarget.style.color=t.accent;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.muted;}}>
                <Plus size={13}/> Nouvelle note
              </button>
            )}
          </div>
        )}

        {/* Notes list */}
        {view==="notes"&&(
          <nav style={{flex:1,overflowY:"auto",padding:"4px 8px 8px"}}>
            {searchResults!==null?(
              <div>
                <div style={{padding:"4px 8px",fontSize:11,color:t.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>{searchResults.length} résultat{searchResults.length!==1?"s":""}</div>
                {searchResults.map(r=>(
                  <div key={r.note.path}>
                    <NoteRow note={r.note} active={active} favorites={favorites} t={t} onToggleFav={toggleFav} onClick={()=>openNote(r.note)} onRename={()=>{setRenaming(r.note);setRenameTo(r.note.name);}} onDragStart={n=>setDragNote(n)}/>
                    <div style={{fontSize:11,color:t.muted,padding:"0 8px 6px 28px",lineHeight:1.4}}>{r.excerpt.slice(0,120)}</div>
                  </div>
                ))}
              </div>
            ):activeTag?(
              <div>
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",fontSize:11,color:t.accent,fontWeight:600,marginBottom:4}}>
                  <Tag size={11}/> #{activeTag}
                  <button onClick={()=>setActiveTag(null)} style={{background:"none",border:"none",color:t.muted,cursor:"pointer",fontSize:11,marginLeft:"auto"}}>✕</button>
                </div>
                {(displayNotes||[]).map(n=><NoteRow key={n.path} note={n} active={active} favorites={favorites} t={t} onToggleFav={toggleFav} onClick={()=>openNote(n)} onRename={()=>{setRenaming(n);setRenameTo(n.name);}}/>)}
              </div>
            ):(
              <>
                {favNotes.length>0&&(
                  <div style={{marginBottom:8}}>
                    <div style={{padding:"4px 8px",fontSize:11,color:t.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>⭐ Favoris</div>
                    {favNotes.map(n=><NoteRow key={n.path} note={n} active={active} favorites={favorites} t={t} onToggleFav={toggleFav} onClick={()=>openNote(n)} onRename={()=>{setRenaming(n);setRenameTo(n.name);}}/>)}
                    <div style={{height:1,background:t.border,margin:"6px 0"}}/>
                  </div>
                )}
                {tree.notes.map(n=><NoteRow key={n.path} note={n} active={active} favorites={favorites} t={t} onToggleFav={toggleFav} onClick={()=>openNote(n)} onRename={()=>{setRenaming(n);setRenameTo(n.name);}}/>)}
                {folders.map(folder=>(
                  <div key={folder} style={{marginTop:4}}>
                    <div style={{display:"flex",alignItems:"center"}}>
                      <button onClick={()=>setExpandedFolders(prev=>{const s=new Set(prev);s.has(folder)?s.delete(folder):s.add(folder);return s;})}
                        style={{display:"flex",alignItems:"center",gap:6,flex:1,padding:"5px 8px",background:"none",border:"none",color:t.muted,fontSize:12,fontWeight:600,cursor:"pointer",borderRadius:6,textTransform:"uppercase",letterSpacing:"0.5px"}}
                        onMouseEnter={e=>(e.currentTarget.style.background=t.hoverBg)} onMouseLeave={e=>(e.currentTarget.style.background="none")}>
                        {expandedFolders.has(folder)?<ChevronDown size={12}/>:<ChevronRight size={12}/>}
                        {expandedFolders.has(folder)?<FolderOpen size={12}/>:<Folder size={12}/>}
                        {folder}
                        <span style={{marginLeft:"auto",fontSize:10,opacity:.6}}>{tree.subfolders[folder].notes.length}</span>
                      </button>
                      <button onClick={()=>{setNewNoteFolder(`notes/${folder}`);setCreating(true);}} style={{padding:"3px 5px",background:"none",border:"none",color:t.muted,cursor:"pointer",borderRadius:4,opacity:.5}} title="Nouvelle note ici"
                        onMouseEnter={e=>(e.currentTarget.style.opacity="1")} onMouseLeave={e=>(e.currentTarget.style.opacity=".5")}><Plus size={11}/></button>
                      <button onClick={()=>setCreatingFolder(folder)} style={{padding:"3px 5px",background:"none",border:"none",color:t.muted,cursor:"pointer",borderRadius:4,opacity:.5}} title="Nouveau sous-dossier"
                        onMouseEnter={e=>(e.currentTarget.style.opacity="1")} onMouseLeave={e=>(e.currentTarget.style.opacity=".5")}>📁</button>
                    </div>
                    {expandedFolders.has(folder)&&(
                      <div style={{paddingLeft:12}}>
                        {tree.subfolders[folder].notes.map(n=><NoteRow key={n.path} note={n} active={active} favorites={favorites} t={t} onToggleFav={toggleFav} onClick={()=>openNote(n)} onRename={()=>{setRenaming(n);setRenameTo(n.name);}}/>)}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </nav>
        )}

        {/* Tags (notes only) */}
        {view==="notes"&&allTags.length>0&&(
          <div style={{padding:"8px 12px",borderTop:`1px solid ${t.border}`,flexShrink:0}}>
            <div style={{fontSize:11,color:t.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,display:"flex",alignItems:"center",gap:6}}><Tag size={11}/> Tags</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
              {allTags.map(tag=>(
                <button key={tag} onClick={()=>setActiveTag(activeTag===tag?null:tag)}
                  style={{padding:"2px 8px",borderRadius:20,fontSize:11,cursor:"pointer",border:"none",background:activeTag===tag?t.accent:t.surface2,color:activeTag===tag?"#fff":t.muted}}>
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{padding:"6px 12px",borderTop:`1px solid ${t.border}`,fontSize:11,color:t.muted,display:"flex",alignItems:"center",gap:6,cursor:"pointer",flexShrink:0}} onClick={()=>setShowShortcuts(true)}>
          <Keyboard size={11}/> <span>Raccourcis</span>
          <kbd style={{marginLeft:"auto",background:t.surface2,border:`1px solid ${t.border}`,borderRadius:3,padding:"1px 5px",fontSize:10}}>?</kbd>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>

        {/* Mobile top bar */}
        {isMobile&&(
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",borderBottom:`1px solid ${t.border}`,background:t.bg,flexShrink:0}}>
            <button onClick={()=>setSidebarOpen(!sidebarOpen)} style={{background:"none",border:"none",color:t.muted,cursor:"pointer",padding:4}}><Menu size={20}/></button>
            {active&&view==="notes"&&(
              <>
                <span style={{fontSize:14,fontWeight:600,color:t.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{active.name}</span>
                <button onClick={saveNote} disabled={saving||!isDirty}
                  style={{padding:"6px 12px",background:isDirty?t.accent:t.surface,border:"none",borderRadius:8,color:isDirty?"#fff":t.muted,fontSize:12,fontWeight:600,cursor:isDirty?"pointer":"default"}}>
                  {saved?"✓":saving?"...":"Sauv."}
                </button>
              </>
            )}
            {!active&&<span style={{fontSize:15,fontWeight:700,color:t.text}}>pazent.brain</span>}
          </div>
        )}

        {/* Desktop topbar (notes view) */}
        {!isMobile&&!focusMode&&view==="notes"&&(
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"0 16px",height:48,borderBottom:`1px solid ${t.border}`,background:t.bg,flexShrink:0}}>
            {active?(
              <>
                <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:t.muted,flex:1,minWidth:0,overflow:"hidden"}}>
                  {active.path.includes("/",6)&&(<><span>{active.path.replace(/^notes\//,"").split("/")[0]}</span><ChevronRight size={12}/></>)}
                  {renaming?.path===active.path?(
                    <input value={renameTo} onChange={e=>setRenameTo(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")renameNote();if(e.key==="Escape")setRenaming(null);}}
                      autoFocus style={{background:"none",border:"none",outline:`1px solid ${t.accent}`,borderRadius:4,color:t.text,fontSize:13,fontWeight:500,padding:"0 4px"}}/>
                  ):(
                    <span style={{color:t.text,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer"}} onDoubleClick={()=>{setRenaming(active);setRenameTo(active.name);}}>
                      {active.name}
                    </span>
                  )}
                  {isDirty&&<span style={{width:6,height:6,borderRadius:"50%",background:t.accent,flexShrink:0}}/>}
                  {autoSaving&&<span style={{fontSize:11,color:t.muted,marginLeft:4}}>Sauvegarde auto...</span>}
                </div>
                <span style={{fontSize:12,color:t.muted,flexShrink:0,display:"flex",gap:8}}>
                  <span style={{display:"flex",alignItems:"center",gap:3}}><AlignLeft size={10}/>{wordCount(content)}</span>
                  <span style={{display:"flex",alignItems:"center",gap:3}}><Clock size={10}/>{readTime(content)}min</span>
                </span>
                <div style={{display:"flex",alignItems:"center",gap:3,flexShrink:0}}>
                  <div style={{display:"flex",background:t.surface,border:`1px solid ${t.border}`,borderRadius:7,overflow:"hidden"}}>
                    {(["edit","split","preview"] as const).map(mode=>(
                      <button key={mode} onClick={()=>setEditorMode(mode)}
                        style={{padding:"5px 8px",background:editorMode===mode?t.accentBg:"none",border:"none",color:editorMode===mode?t.accent:t.muted,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                        {mode==="edit"&&<><Edit3 size={11}/> Éditer</>}
                        {mode==="split"&&<><Columns size={11}/> Split</>}
                        {mode==="preview"&&<><Eye size={11}/> Preview</>}
                      </button>
                    ))}
                  </div>
                  {headings.length>0&&<button onClick={()=>setShowTOC(!showTOC)} style={{padding:"5px 8px",background:showTOC?t.accentBg:t.surface,border:`1px solid ${showTOC?t.accent+"44":t.border}`,borderRadius:7,color:showTOC?t.accent:t.muted,cursor:"pointer"}}><ListIcon size={13}/></button>}
                  <button onClick={()=>setShowHistory(true)} style={{padding:"5px 8px",background:t.surface,border:`1px solid ${t.border}`,borderRadius:7,color:t.muted,cursor:"pointer"}}><History size={13}/></button>
                  <button onClick={()=>setFocusMode(true)} style={{padding:"5px 8px",background:t.surface,border:`1px solid ${t.border}`,borderRadius:7,color:t.muted,cursor:"pointer"}}><Maximize2 size={13}/></button>
                  <button onClick={shareNote} disabled={sharing}
                    style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",background:t.surface,border:`1px solid ${t.border}`,borderRadius:7,color:t.muted,fontSize:12,cursor:"pointer",opacity:sharing?.6:1}}>
                    <span style={{fontSize:13}}>🔗</span> {sharing?"...":"Partager"}
                  </button>
                  <div style={{position:"relative"}}>
                    <button onClick={()=>setShowDownload(!showDownload)} style={{display:"flex",alignItems:"center",gap:5,padding:"5px 10px",background:t.surface,border:`1px solid ${t.border}`,borderRadius:7,color:t.muted,fontSize:12,cursor:"pointer"}}><Download size={13}/> Exporter</button>
                    {showDownload&&(
                      <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:6,zIndex:100,minWidth:170,boxShadow:`0 8px 32px ${t.shadowColor}`}}>
                        {[{label:"Markdown (.md)",fn:downloadMd},{label:"HTML (.html)",fn:downloadHtml},{label:"Texte brut (.txt)",fn:downloadTxt},{label:"PDF (imprimer)",fn:printPdf},{label:"Tout exporter (.zip)",fn:exportAllNotes}].map(({label,fn})=>(
                          <button key={label} onClick={()=>{fn();setShowDownload(false);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 12px",background:"none",border:"none",borderRadius:7,color:t.text,fontSize:13,cursor:"pointer",textAlign:"left"}}
                            onMouseEnter={e=>(e.currentTarget.style.background=t.hoverBg)} onMouseLeave={e=>(e.currentTarget.style.background="none")}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={saveNote} disabled={saving||!isDirty}
                    style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",background:saved?"#00d4ff22":isDirty?t.accent:t.surface,border:`1px solid ${saved?"#00d4ff44":isDirty?"transparent":t.border}`,borderRadius:7,color:saved?"#00d4ff":isDirty?"#fff":t.muted,fontSize:12,fontWeight:600,cursor:isDirty?"pointer":"default",opacity:saving?.6:1}}>
                    {saved?<Check size={13}/>:<Save size={13}/>}{saved?"Sauvegardé":saving?"...":"Sauvegarder"}
                  </button>
                  <button onClick={trashNote} style={{padding:"5px 8px",background:"none",border:`1px solid ${t.border}`,borderRadius:7,color:t.muted,cursor:"pointer"}}
                    onMouseEnter={e=>{e.currentTarget.style.color="#ff4444";e.currentTarget.style.borderColor="#ff444444";}} onMouseLeave={e=>{e.currentTarget.style.color=t.muted;e.currentTarget.style.borderColor=t.border;}}>
                    <Trash2 size={13}/>
                  </button>
                </div>
              </>
            ):(
              <div style={{fontSize:13,color:t.muted}}>← Sélectionne ou crée une note</div>
            )}
          </div>
        )}

        {/* Focus bar */}
        {focusMode&&<div style={{position:"fixed",top:0,left:0,right:0,height:3,background:"linear-gradient(90deg,#6e00ff,#00d4ff)",zIndex:100}}/>}

        {/* Markdown toolbar */}
        {view==="notes"&&active&&editorMode==="edit"&&!focusMode&&!isMobile&&(
          <div style={{display:"flex",alignItems:"center",gap:2,padding:"4px 16px",borderBottom:`1px solid ${t.border}`,background:t.bg,flexShrink:0,overflowX:"auto"}}>
            {[{icon:<Bold size={13}/>,b:"**",a:"**",p:"gras"},{icon:<Italic size={13}/>,b:"*",a:"*",p:"italique"},{icon:<Hash size={13}/>,b:"# ",a:"",p:"titre"},{icon:<ListIcon size={13}/>,b:"- ",a:"",p:"item"},{icon:<Link2 size={13}/>,b:"[",a:"](url)",p:"lien"},{icon:<Code size={13}/>,b:"```\n",a:"\n```",p:"code"}].map(({icon,b,a,p},i)=>(
              <button key={i} onClick={()=>insertMd(textareaRef,b,a,p)} style={{padding:"3px 7px",background:"none",border:"none",borderRadius:5,color:t.muted,cursor:"pointer",flexShrink:0}}
                onMouseEnter={e=>(e.currentTarget.style.background=t.hoverBg)} onMouseLeave={e=>(e.currentTarget.style.background="none")}>{icon}</button>
            ))}
            <div style={{marginLeft:"auto",display:"flex",gap:4}}>
              <button onClick={toggleWordWrap} title={wordWrap?"Désactiver word wrap":"Activer word wrap"}
                style={{padding:"3px 8px",background:wordWrap?t.accentBg:"none",border:`1px solid ${wordWrap?t.accent+"44":t.border}`,borderRadius:5,color:wordWrap?t.accent:t.muted,cursor:"pointer",fontSize:11,flexShrink:0}}>
                Wrap
              </button>
              <button onClick={toggleAutoSave} title={autoSave?"Désactiver auto-save":"Activer auto-save"}
                style={{padding:"3px 8px",background:autoSave?t.accentBg:"none",border:`1px solid ${autoSave?t.accent+"44":t.border}`,borderRadius:5,color:autoSave?t.accent:t.muted,cursor:"pointer",fontSize:11,flexShrink:0}}>
                Auto
              </button>
              <button onClick={()=>setShowQuickCapture(true)} style={{padding:"3px 8px",background:"none",border:`1px solid ${t.border}`,borderRadius:5,color:t.muted,cursor:"pointer",fontSize:11,flexShrink:0,display:"flex",alignItems:"center",gap:4}}>
                <Zap size={11}/> Capture
              </button>
            </div>
          </div>
        )}

        {/* Content area */}
        <div style={{flex:1,overflow:"hidden",display:"flex"}}>
          {view==="dashboard"&&<Dashboard notes={notes} favorites={favorites} t={t} onOpenNote={openNote}/>}
          {view==="drive"&&<DriveView t={t} password={password}/>}
          {view==="trash"&&(
            <div style={{flex:1,overflowY:"auto",padding:"24px 20px"}}>
              <div style={{maxWidth:800,margin:"0 auto"}}>
                <div style={{marginBottom:20}}>
                  <div style={{fontSize:22,fontWeight:700,color:t.text,marginBottom:4}}>🗑️ Corbeille</div>
                  <div style={{fontSize:13,color:t.muted}}>{trashNotes.length} note{trashNotes.length!==1?"s":""} dans la corbeille</div>
                </div>
                {trashNotes.length===0?(
                  <div style={{textAlign:"center",padding:"40px 0",color:t.muted}}>
                    <div style={{fontSize:40,marginBottom:12}}>✨</div>
                    <div>La corbeille est vide</div>
                  </div>
                ):(
                  <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,overflow:"hidden"}}>
                    {trashNotes.map((note,i)=>(
                      <div key={note.path} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<trashNotes.length-1?`1px solid ${t.border}`:"none"}}>
                        <FileText size={16} color={t.muted}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:14,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{note.path.split("/").pop()?.replace(".md","")}</div>
                          <div style={{fontSize:11,color:t.muted}}>{note.path}</div>
                        </div>
                        <div style={{display:"flex",gap:6,flexShrink:0}}>
                          <button onClick={()=>restoreNote(note)} style={{padding:"6px 12px",background:t.accentBg,border:`1px solid ${t.accent}44`,borderRadius:7,color:t.accent,fontSize:12,fontWeight:600,cursor:"pointer"}}>
                            Restaurer
                          </button>
                          <button onClick={()=>deleteForever(note)} style={{padding:"6px 10px",background:"none",border:`1px solid ${t.border}`,borderRadius:7,color:t.muted,cursor:"pointer"}}
                            onMouseEnter={e=>{e.currentTarget.style.color="#ff4444";e.currentTarget.style.borderColor="#ff444444";}} onMouseLeave={e=>{e.currentTarget.style.color=t.muted;e.currentTarget.style.borderColor=t.border;}}>
                            <Trash2 size={12}/>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {trashNotes.length>0&&(
                  <button onClick={async()=>{if(!confirm("Vider toute la corbeille ?"))return;for(const n of trashNotes)await deleteForever(n);}}
                    style={{marginTop:12,padding:"8px 16px",background:"none",border:`1px solid #ff444444`,borderRadius:8,color:"#ff4444",fontSize:13,cursor:"pointer"}}>
                    Vider la corbeille
                  </button>
                )}
              </div>
            </div>
          )}
          {view==="notes"&&(
            !active?(
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,color:t.muted,padding:20}}>
                <div style={{width:64,height:64,borderRadius:16,background:`linear-gradient(135deg,${t.accent}11,#00d4ff11)`,border:`1px solid ${t.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28}}>📝</div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:15,fontWeight:500,color:t.text,marginBottom:6}}>Aucune note sélectionnée</div>
                  <div style={{fontSize:13,color:t.muted}}>Crée une note ou sélectionnes-en une</div>
                </div>
                <button onClick={()=>setCreating(true)} style={{display:"flex",alignItems:"center",gap:8,padding:"10px 20px",background:t.accent,border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                  <Plus size={14}/> Nouvelle note
                </button>
              </div>
            ):(
              <>
                {(editorMode==="edit"||editorMode==="split")&&(
                  <div style={{flex:1,overflow:"hidden",borderRight:editorMode==="split"?`1px solid ${t.border}`:"none"}}>
                    <textarea ref={textareaRef} value={content} onChange={e=>setContent(e.target.value)}
                      style={{width:"100%",height:"100%",padding:focusMode?"60px 80px":isMobile?"16px":"32px 48px",background:t.editorBg,color:t.text,border:"none",outline:"none",resize:"none",fontFamily:"'JetBrains Mono',monospace",fontSize:isMobile?13:14,lineHeight:1.9,caretColor:"#00d4ff",whiteSpace:wordWrap?"pre-wrap":"pre",overflowX:wordWrap?"hidden":"auto"}}
                      placeholder="Commence à écrire en Markdown..." spellCheck={false} onPaste={handlePaste}/>
                  </div>
                )}
                {(editorMode==="preview"||editorMode==="split")&&(
                  <div style={{flex:1,overflowY:"auto",padding:focusMode?"60px 80px":isMobile?"16px":"32px 48px"}}>
                    <article className="prose" style={{maxWidth:760,margin:"0 auto"}}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{content}</ReactMarkdown>
                    </article>
                  </div>
                )}
                {showTOC&&headings.length>0&&!isMobile&&(
                  <div style={{width:190,borderLeft:`1px solid ${t.border}`,padding:"16px 12px",overflowY:"auto",background:t.bg}}>
                    <div style={{fontSize:11,fontWeight:600,color:t.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
                      <ListIcon size={11}/> Sommaire
                      <button onClick={()=>setShowTOC(false)} style={{marginLeft:"auto",background:"none",border:"none",color:t.muted,cursor:"pointer"}}><X size={11}/></button>
                    </div>
                    {headings.map((h,i)=>(
                      <button key={i} style={{display:"block",width:"100%",textAlign:"left",padding:`3px ${(h.level-1)*10}px`,background:"none",border:"none",color:h.level===1?t.text:t.muted,fontSize:h.level===1?13:11,cursor:"pointer",lineHeight:1.4,marginBottom:2,borderRadius:4}}
                        onMouseEnter={e=>(e.currentTarget.style.color=t.accent)} onMouseLeave={e=>(e.currentTarget.style.color=h.level===1?t.text:t.muted)}>
                        {h.text}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )
          )}
        </div>

        {/* Mobile bottom toolbar (notes) */}
        {isMobile&&view==="notes"&&active&&(
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-around",padding:"8px 16px",borderTop:`1px solid ${t.border}`,background:t.bg,flexShrink:0}}>
            {(["edit","preview"] as const).map(mode=>(
              <button key={mode} onClick={()=>setEditorMode(mode)}
                style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"6px 12px",background:editorMode===mode?t.accentBg:"none",border:`1px solid ${editorMode===mode?t.accent+"44":t.border}`,borderRadius:8,color:editorMode===mode?t.accent:t.muted,fontSize:11,cursor:"pointer"}}>
                {mode==="edit"?<><Edit3 size={16}/> Éditer</>:<><Eye size={16}/> Preview</>}
              </button>
            ))}
            <button onClick={downloadMd} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"6px 12px",background:"none",border:`1px solid ${t.border}`,borderRadius:8,color:t.muted,fontSize:11,cursor:"pointer"}}><Download size={16}/> Export</button>
            <button onClick={()=>setShowHistory(true)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,padding:"6px 12px",background:"none",border:`1px solid ${t.border}`,borderRadius:8,color:t.muted,fontSize:11,cursor:"pointer"}}><History size={16}/> Historique</button>
          </div>
        )}

        {/* Paste uploading indicator */}
        {pasteUploading&&(
          <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,padding:"8px 16px",fontSize:13,color:t.muted,zIndex:500}}>
            📤 Upload de l'image...
          </div>
        )}

        {/* Focus save */}
        {focusMode&&active&&(
          <div style={{position:"fixed",bottom:24,right:24,display:"flex",gap:8,zIndex:200}}>
            <button onClick={()=>setFocusMode(false)} style={{padding:"8px 12px",background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.muted,cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13}}><Minimize2 size={14}/> Quitter</button>
            <button onClick={saveNote} disabled={saving||!isDirty}
              style={{padding:"8px 16px",background:isDirty?t.accent:t.surface,border:"none",borderRadius:8,color:isDirty?"#fff":t.muted,cursor:isDirty?"pointer":"default",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
              <Save size={14}/>{saved?"Sauvegardé ✓":"Sauvegarder"}
            </button>
          </div>
        )}
      </main>

      {/* Modals */}
      {showHistory&&active&&<HistoryModal note={active} t={t} onRestore={c=>{setContent(c);setShowHistory(false);}} onClose={()=>setShowHistory(false)}/>}
      {showShortcuts&&<ShortcutsModal t={t} onClose={()=>setShowShortcuts(false)}/>}
      {showQuickCapture&&<QuickCapture t={t} folders={folders} password={password} onCreated={async n=>{await fetchNotes();await openNote(n);}} onClose={()=>setShowQuickCapture(false)}/>}
      {showShare&&shareUrl&&(
        <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowShare(false)}>
          <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:24,width:"100%",maxWidth:480}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
              <span style={{fontSize:20}}>🔗</span>
              <div>
                <div style={{fontWeight:600,color:t.text,fontSize:15}}>Note partagée !</div>
                <div style={{fontSize:12,color:t.muted}}>Lien copié dans le presse-papiers</div>
              </div>
              <button onClick={()=>setShowShare(false)} style={{marginLeft:"auto",background:"none",border:"none",color:t.muted,cursor:"pointer"}}><X size={16}/></button>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:8,padding:"8px 12px",marginBottom:12}}>
              <span style={{flex:1,fontSize:13,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{shareUrl}</span>
              <button onClick={()=>navigator.clipboard.writeText(shareUrl)} style={{padding:"4px 10px",background:t.accent,border:"none",borderRadius:6,color:"#fff",fontSize:12,cursor:"pointer",flexShrink:0}}>Copier</button>
            </div>
            <a href={shareUrl} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:t.accent,textDecoration:"none"}}>
              <span>↗</span> Ouvrir dans un nouvel onglet
            </a>
          </div>
        </div>
      )}

      {showCommandPalette&&(
        <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:120}} onClick={()=>setShowCommandPalette(false)}>
          <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,width:"100%",maxWidth:560,overflow:"hidden",boxShadow:`0 20px 60px ${t.shadowColor}`}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:`1px solid ${t.border}`}}>
              <Search size={16} color={t.muted}/>
              <input autoFocus placeholder="Chercher une note ou une action..." onChange={async e=>{if(e.target.value.length>1)await doSearch(e.target.value);}}
                style={{flex:1,background:"none",border:"none",outline:"none",color:t.text,fontSize:15}}/>
              <kbd style={{background:t.surface2,border:`1px solid ${t.border}`,borderRadius:4,padding:"1px 6px",fontSize:11,color:t.muted}}>Esc</kbd>
            </div>
            <div style={{maxHeight:400,overflowY:"auto"}}>
              <div style={{padding:"6px 8px"}}>
                <div style={{fontSize:11,color:t.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",padding:"4px 8px",marginBottom:4}}>📝 Notes</div>
                {notes.slice(0,8).map(n=>(
                  <button key={n.path} onClick={()=>{openNote(n);setShowCommandPalette(false);}}
                    style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 12px",background:"none",border:"none",borderRadius:8,color:t.text,fontSize:14,cursor:"pointer",textAlign:"left"}}
                    onMouseEnter={e=>(e.currentTarget.style.background=t.hoverBg)} onMouseLeave={e=>(e.currentTarget.style.background="none")}>
                    <FileText size={14} color={t.muted}/>
                    <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.path.split("/").pop()?.replace(".md","")}</span>
                    <span style={{fontSize:11,color:t.muted}}>{n.path.includes("/")?n.path.split("/").slice(-2,-1)[0]:""}</span>
                  </button>
                ))}
              </div>
              <div style={{borderTop:`1px solid ${t.border}`,padding:"6px 8px"}}>
                <div style={{fontSize:11,color:t.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",padding:"4px 8px",marginBottom:4}}>⚡ Actions</div>
                {[
                  {label:"Nouvelle note",icon:"📝",fn:()=>{setCreating(true);setShowCommandPalette(false);}},
                  {label:"Quick capture",icon:"⚡",fn:()=>{setShowQuickCapture(true);setShowCommandPalette(false);}},
                  {label:"Dashboard",icon:"📊",fn:()=>{setView("dashboard");setShowCommandPalette(false);}},
                  {label:"Drive",icon:"📁",fn:()=>{setView("drive");setShowCommandPalette(false);}},
                  {label:darkMode?"Mode clair":"Mode sombre",icon:darkMode?"☀️":"🌙",fn:()=>{toggleTheme();setShowCommandPalette(false);}},
                  {label:"Exporter toutes les notes (.zip)",icon:"📦",fn:()=>{exportAllNotes();setShowCommandPalette(false);}},
                ].map(({label,icon,fn})=>(
                  <button key={label} onClick={fn}
                    style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"8px 12px",background:"none",border:"none",borderRadius:8,color:t.text,fontSize:14,cursor:"pointer",textAlign:"left"}}
                    onMouseEnter={e=>(e.currentTarget.style.background=t.hoverBg)} onMouseLeave={e=>(e.currentTarget.style.background="none")}>
                    <span style={{fontSize:16}}>{icon}</span> {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showDownload&&<div onClick={()=>setShowDownload(false)} style={{position:"fixed",inset:0,zIndex:50}}/>}
    </div>
  );
}
