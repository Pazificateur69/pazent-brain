"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  FileText, FolderOpen, Folder, Plus, Search, Save, Trash2, Eye, Edit3,
  ChevronRight, ChevronDown, Download, Hash, AlignLeft, Clock, Bold,
  Italic, Link2, X, Check, Star, RefreshCw, Columns, Maximize2,
  Minimize2, History, Tag, List as ListIcon, Keyboard, Lock,
  BarChart2, Zap, RotateCcw, Upload, File, Image, FileCode,
  FileArchive, Music, Video, Menu, ArrowLeft, ExternalLink, Code
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

/* ── Types ── */
interface Note { path: string; name: string; content?: string; sha?: string; }
interface DriveFile { name: string; path: string; type: string; size: number; download_url: string; sha?: string; }
interface FolderNode { name: string; notes: Note[]; subfolders: Record<string, FolderNode>; }

const PASSWORD_KEY = "pazent_brain_auth";
const FAVS_KEY = "pazent_brain_favs";
const THEME_KEY = "pazent_brain_theme";

/* ── Theme ── */
interface Theme {
  bg: string; surface: string; surface2: string; border: string;
  text: string; muted: string; accent: string; accentBg: string;
  inputBg: string; hoverBg: string; shadow: string;
}
const DARK: Theme = {
  bg:"#0d1117", surface:"#161b22", surface2:"#1c2128", border:"#21262d",
  text:"#e6edf3", muted:"#8b949e", accent:"#6e00ff", accentBg:"rgba(110,0,255,0.12)",
  inputBg:"#161b22", hoverBg:"#1c2128", shadow:"0 8px 32px rgba(0,0,0,0.6)"
};
const LIGHT: Theme = {
  bg:"#f6f8fa", surface:"#ffffff", surface2:"#f3f4f6", border:"#d0d7de",
  text:"#1f2328", muted:"#57606a", accent:"#6e00ff", accentBg:"rgba(110,0,255,0.08)",
  inputBg:"#ffffff", hoverBg:"#f3f4f6", shadow:"0 8px 32px rgba(0,0,0,0.12)"
};

/* ── Templates ── */
const TEMPLATES: Record<string, string> = {
  "Writeup CTF": `# Writeup — [Challenge]\n\n**Plateforme:** HackTheBox / TryHackMe\n**Catégorie:** Web / Pwn / Crypto\n**Difficulté:** Easy / Medium / Hard\n**Date:** ${new Date().toLocaleDateString("fr-FR")}\n\n---\n\n## Reconnaissance\n\n## Exploitation\n\n## Flag\n\n\`\`\`\nflag{...}\n\`\`\`\n\n## Lessons learned\n`,
  "Doc Projet": `# [Projet]\n\n**Stack:**\n**Date:** ${new Date().toLocaleDateString("fr-FR")}\n\n---\n\n## Overview\n\n## Architecture\n\n## Features\n- [ ] Feature 1\n- [ ] Feature 2\n\n## Setup\n\n\`\`\`bash\n# Installation\n\`\`\`\n`,
  "Cours Guardia": `# [Matière] — [Chapitre]\n\n**Date:** ${new Date().toLocaleDateString("fr-FR")}\n**Tags:** cours, guardia\n\n---\n\n## Objectifs\n\n## Concepts clés\n\n## Notes\n\n## Résumé\n`,
  "Pentest Report": `# Rapport Pentest — [Cible]\n\n**Date:** ${new Date().toLocaleDateString("fr-FR")}\n**Testeur:** Alessandro Gagliardi\n**Scope:**\n**Méthode:** OWASP Testing Guide v4.2\n\n---\n\n## Executive Summary\n\n## Vulnérabilités\n\n| ID | Titre | Criticité | CVSS |\n|----|-------|-----------|------|\n| V1 | | Critique | 9.x |\n\n## V1 — [Titre]\n\n**Criticité:** Critique\n**Composant:**\n\n### Description\n\n### PoC\n\n\`\`\`http\nGET /vulnerable HTTP/1.1\n\`\`\`\n\n### Recommandation\n\n---\n\n## Conclusion\n`,
};

/* ── Utils ── */
function buildTree(notes: Note[]): FolderNode {
  const root: FolderNode = { name:"root", notes:[], subfolders:{} };
  for (const note of notes) {
    if (note.path.includes("_trash")) continue;
    const parts = note.path.replace(/^notes\//,"").split("/");
    if (parts.length===1) { root.notes.push(note); continue; }
    let node = root;
    for (let i=0; i<parts.length-1; i++) {
      const seg = parts[i];
      if (!node.subfolders[seg]) node.subfolders[seg] = {name:seg, notes:[], subfolders:{}};
      node = node.subfolders[seg];
    }
    node.notes.push(note);
  }
  return root;
}

function extractTags(content: string): string[] {
  const tags: string[] = [];
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (fm) { const m = fm[1].match(/tags:\s*\[([^\]]+)\]/); if (m) tags.push(...m[1].split(",").map((t:string)=>t.trim())); }
  const rx = /#([a-zA-Z][a-zA-Z0-9_-]*)/g; let m;
  while ((m=rx.exec(content))!==null) if (!tags.includes(m[1])) tags.push(m[1]);
  return tags;
}

function extractHeadings(content: string) {
  const rx=/^(#{1,3})\s+(.+)$/gm; const h:[{level:number;text:string;id:string}]=[] as never;
  let m; while((m=rx.exec(content))!==null) h.push({level:m[1].length,text:m[2],id:m[2].toLowerCase().replace(/[^a-z0-9]+/g,"-")});
  return h;
}

function wc(t:string){return t.trim().split(/\s+/).filter(Boolean).length;}
function rt(t:string){return Math.max(1,Math.round(wc(t)/200));}

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg","ico"].includes(ext||"")) return <Image size={14}/>;
  if (["mp4","mov","avi","mkv","webm"].includes(ext||"")) return <Video size={14}/>;
  if (["mp3","wav","ogg","flac"].includes(ext||"")) return <Music size={14}/>;
  if (["zip","tar","gz","rar","7z"].includes(ext||"")) return <FileArchive size={14}/>;
  if (["js","ts","tsx","jsx","py","c","cpp","rs","go","php"].includes(ext||"")) return <FileCode size={14}/>;
  if (["pdf"].includes(ext||"")) return <File size={14}/>;
  return <File size={14}/>;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}

function insertMd(ref:React.RefObject<HTMLTextAreaElement>,before:string,after="",ph=""){
  const el=ref.current; if(!el)return;
  const s=el.selectionStart,e=el.selectionEnd;
  const sel=el.value.slice(s,e)||ph;
  el.value=el.value.slice(0,s)+before+sel+after+el.value.slice(e);
  el.focus(); el.setSelectionRange(s+before.length,s+before.length+sel.length);
  el.dispatchEvent(new Event("input",{bubbles:true}));
}

function mdToHtml(md:string,title:string,dark:boolean){
  const bg=dark?"#0d1117":"#fff",fg=dark?"#e6edf3":"#1f2328";
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${title}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:${bg};color:${fg};padding:3rem;max-width:860px;margin:auto;line-height:1.8}h1{font-size:2rem;font-weight:700;margin:2rem 0 1rem;border-bottom:1px solid #21262d;padding-bottom:.5rem}h2{font-size:1.5rem;font-weight:600;margin:1.5rem 0 .8rem}h3{font-size:1.2rem;color:#00d4ff;margin:1rem 0 .6rem}p{margin-bottom:1rem}code{background:#161b22;border:1px solid #21262d;padding:.15em .4em;border-radius:4px;font-family:monospace;font-size:.85em;color:#a78bfa}pre{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:1.2rem;overflow-x:auto;margin:1rem 0}pre code{background:none;border:none;color:${fg}}ul,ol{padding-left:1.5rem;margin-bottom:1rem}li{margin-bottom:.3rem}blockquote{border-left:3px solid #6e00ff;padding-left:1rem;opacity:.75;font-style:italic;margin:1rem 0}a{color:#00d4ff}table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{border:1px solid #21262d;padding:.6rem 1rem}th{background:#161b22}strong{font-weight:700}hr{border:none;border-top:1px solid #21262d;margin:1.5rem 0}img{max-width:100%;border-radius:8px;margin:1rem 0}</style></head><body>${md}</body></html>`;
}

/* ── Auth ── */
function AuthScreen({onAuth}:{onAuth:(p:string)=>void}){
  const [pw,setPw]=useState("");
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0d1117",padding:20}}>
      <div style={{width:"100%",maxWidth:360}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:32}}>
          <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,#6e00ff,#00d4ff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🧠</div>
          <div><div style={{fontWeight:700,fontSize:22,color:"#fff"}}>pazent.brain</div><div style={{fontSize:12,color:"#8b949e"}}>knowledge base privée</div></div>
        </div>
        <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:14,padding:24}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}><Lock size={15} color="#6e00ff"/><span style={{fontSize:14,fontWeight:500,color:"#e6edf3"}}>Accès protégé</span></div>
          <input type="password" placeholder="Mot de passe" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onAuth(pw)}
            style={{width:"100%",padding:"12px 14px",background:"#0d1117",border:"1px solid #21262d",borderRadius:10,color:"#e6edf3",fontSize:14,outline:"none",marginBottom:12}} autoFocus/>
          <button onClick={()=>onAuth(pw)} style={{width:"100%",padding:"12px 14px",background:"linear-gradient(135deg,#6e00ff,#5500cc)",border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:600,cursor:"pointer"}}>Entrer →</button>
        </div>
      </div>
    </div>
  );
}

/* ── Drive panel ── */
function DrivePanel({t,password}:{t:Theme;password:string}){
  const [files,setFiles]=useState<DriveFile[]>([]);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [dragOver,setDragOver]=useState(false);
  const [progress,setProgress]=useState("");
  const fileRef=useRef<HTMLInputElement>(null);

  const load=useCallback(async()=>{
    setLoading(true);
    const res=await fetch("/api/files?folder=files");
    const data=await res.json();
    setFiles(Array.isArray(data)?data:[]);
    setLoading(false);
  },[]);

  useEffect(()=>{load();},[load]);

  async function upload(fileList:FileList|null){
    if(!fileList||fileList.length===0)return;
    setUploading(true);
    for(let i=0;i<fileList.length;i++){
      const f=fileList[i];
      setProgress(`Upload ${i+1}/${fileList.length}: ${f.name}`);
      const fd=new FormData(); fd.append("file",f); fd.append("folder","files");
      await fetch("/api/upload",{method:"POST",headers:{"x-app-password":password},body:fd});
    }
    setUploading(false); setProgress(""); load();
  }

  async function deleteFile(file:DriveFile){
    if(!confirm(`Supprimer "${file.name}" ?`))return;
    // Get sha first
    const res=await fetch(`https://api.github.com/repos/Pazificateur69/pazent-brain-notes/contents/${file.path}`,{headers:{"Authorization":`token ${process.env.NEXT_PUBLIC_GITHUB_TOKEN||""}`}});
    // We'll call delete via API
    await fetch("/api/files",{method:"DELETE",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path:file.path,sha:file.sha||""})});
    load();
  }

  const isImage=(name:string)=>["jpg","jpeg","png","gif","webp","svg"].includes(name.split(".").pop()?.toLowerCase()||"");

  return (
    <div style={{flex:1,overflowY:"auto",padding:"24px 32px"}} className="fade-in">
      <div style={{maxWidth:900,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
          <div>
            <h1 style={{fontSize:22,fontWeight:700,color:t.text,marginBottom:4}}>📁 Drive</h1>
            <p style={{fontSize:13,color:t.muted}}>{files.length} fichier{files.length!==1?"s":""} · Stockage GitHub</p>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>fileRef.current?.click()} disabled={uploading}
              style={{display:"flex",alignItems:"center",gap:8,padding:"8px 16px",background:t.accent,border:"none",borderRadius:8,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer",opacity:uploading?.6:1}}>
              <Upload size={14}/> {uploading?"Upload...":"Ajouter des fichiers"}
            </button>
            <input ref={fileRef} type="file" multiple style={{display:"none"}} onChange={e=>upload(e.target.files)}/>
          </div>
        </div>

        {progress&&<div style={{padding:"8px 12px",background:t.accentBg,border:`1px solid ${t.accent}44`,borderRadius:8,fontSize:13,color:t.accent,marginBottom:16}}>{progress}</div>}

        {/* Drop zone */}
        <div
          onDragOver={e=>{e.preventDefault();setDragOver(true);}}
          onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);upload(e.dataTransfer.files);}}
          style={{border:`2px dashed ${dragOver?t.accent:t.border}`,borderRadius:12,padding:"32px",textAlign:"center",marginBottom:24,transition:"all .2s",background:dragOver?t.accentBg:"transparent",cursor:"pointer"}}
          onClick={()=>fileRef.current?.click()}>
          <Upload size={28} color={dragOver?t.accent:t.muted} style={{margin:"0 auto 10px"}}/>
          <div style={{fontSize:14,color:t.muted}}>Glisse des fichiers ici ou <span style={{color:t.accent,fontWeight:600}}>clique pour uploader</span></div>
          <div style={{fontSize:12,color:t.muted,marginTop:4}}>PDF, images, documents, code, archives...</div>
        </div>

        {loading ? (
          <div style={{textAlign:"center",color:t.muted,fontSize:14,padding:40}}>Chargement...</div>
        ) : files.length===0 ? (
          <div style={{textAlign:"center",color:t.muted,fontSize:14,padding:40}}>Aucun fichier. Commence par en uploader un !</div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12}}>
            {files.map(f=>(
              <div key={f.path} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,overflow:"hidden",transition:"transform .15s",cursor:"pointer"}}
                onMouseEnter={e=>(e.currentTarget.style.transform="translateY(-2px)")}
                onMouseLeave={e=>(e.currentTarget.style.transform="none")}>
                {isImage(f.name) ? (
                  <div style={{height:120,background:t.surface2,overflow:"hidden"}}>
                    <img src={f.download_url} alt={f.name} style={{width:"100%",height:"100%",objectFit:"cover"}} loading="lazy"/>
                  </div>
                ) : (
                  <div style={{height:120,background:t.surface2,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <span style={{color:t.muted}}>{fileIcon(f.name)}</span>
                  </div>
                )}
                <div style={{padding:"10px 12px"}}>
                  <div style={{fontSize:12,fontWeight:500,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}} title={f.name}>{f.name}</div>
                  <div style={{fontSize:11,color:t.muted,marginBottom:8}}>{formatSize(f.size)}</div>
                  <div style={{display:"flex",gap:6}}>
                    <a href={f.download_url} target="_blank" rel="noopener noreferrer"
                      style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:4,padding:"4px 0",background:t.accentBg,border:`1px solid ${t.accent}33`,borderRadius:6,color:t.accent,fontSize:11,textDecoration:"none",fontWeight:500}}>
                      <ExternalLink size={10}/> Ouvrir
                    </a>
                    <button onClick={()=>deleteFile(f)}
                      style={{padding:"4px 8px",background:"none",border:`1px solid ${t.border}`,borderRadius:6,color:t.muted,cursor:"pointer",fontSize:11}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor="#ff444444";e.currentTarget.style.color="#ff4444";}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.muted;}}>
                      <Trash2 size={10}/>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Dashboard ── */
function Dashboard({notes,favorites,t,onOpenNote}:{notes:Note[];favorites:string[];t:Theme;onOpenNote:(n:Note)=>void}){
  const totalWords=notes.reduce((a,n)=>a+wc(n.content||""),0);
  const allTags=[...new Set(notes.flatMap(n=>extractTags(n.content||"")))];
  return (
    <div style={{flex:1,overflowY:"auto",padding:"24px 32px"}} className="fade-in">
      <div style={{maxWidth:860,margin:"0 auto"}}>
        <div style={{marginBottom:28}}>
          <div style={{fontSize:26,fontWeight:700,color:t.text,marginBottom:4}}>Bonjour AL 👋</div>
          <div style={{fontSize:13,color:t.muted}}>{new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:24}}>
          {[{label:"Notes",value:notes.length,icon:"📄",color:"#6e00ff"},{label:"Mots",value:totalWords.toLocaleString(),icon:"✍️",color:"#00d4ff"},{label:"Tags",value:allTags.length,icon:"🏷️",color:"#f0b429"},{label:"Favoris",value:favorites.length,icon:"⭐",color:"#ff6b35"}].map(s=>(
            <div key={s.label} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:16,textAlign:"center"}}>
              <div style={{fontSize:22,marginBottom:6}}>{s.icon}</div>
              <div style={{fontSize:20,fontWeight:700,color:t.text}}>{s.value}</div>
              <div style={{fontSize:11,color:t.muted}}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12,marginBottom:16}}>
          <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:16}}>
            <div style={{fontSize:12,fontWeight:600,color:t.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:12}}>📝 Notes récentes</div>
            {notes.slice(0,6).map(n=>(
              <button key={n.path} onClick={()=>onOpenNote(n)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"6px 0",background:"none",border:"none",borderBottom:`1px solid ${t.border}22`,cursor:"pointer",textAlign:"left"}}>
                <FileText size={12} color={t.muted}/>
                <span style={{fontSize:13,color:t.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{n.path.split("/").pop()?.replace(".md","")}</span>
                <span style={{fontSize:11,color:t.muted,whiteSpace:"nowrap"}}>{n.path.split("/").slice(-2,-1)[0]||""}</span>
              </button>
            ))}
          </div>
          {allTags.length>0&&(
            <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:16}}>
              <div style={{fontSize:12,fontWeight:600,color:t.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:12}}>🏷️ Tags populaires</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {allTags.map(tag=><span key={tag} style={{padding:"3px 10px",borderRadius:20,fontSize:12,background:t.accentBg,color:t.accent,border:`1px solid ${t.accent}33`}}>#{tag}</span>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── History Modal ── */
function HistoryModal({note,t,onRestore,onClose}:{note:Note;t:Theme;onRestore:(c:string)=>void;onClose:()=>void}){
  const [commits,setCommits]=useState<{sha:string;message:string;date:string}[]>([]);
  const [sel,setSel]=useState<string|null>(null);
  const [preview,setPreview]=useState<string|null>(null);
  useEffect(()=>{fetch(`/api/history?path=${encodeURIComponent(note.path)}`).then(r=>r.json()).then(setCommits);},[note.path]);
  async function load(sha:string){setSel(sha);const r=await fetch(`/api/file-at-commit?path=${encodeURIComponent(note.path)}&sha=${sha}`);const d=await r.json();setPreview(d.content||"");}
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
              {commits.map(c=><button key={c.sha} onClick={()=>load(c.sha)} style={{display:"block",width:"100%",padding:"10px 14px",textAlign:"left",background:sel===c.sha?t.accentBg:"none",border:"none",borderBottom:`1px solid ${t.border}22`,cursor:"pointer"}}>
                <div style={{fontSize:12,color:t.text,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.message}</div>
                <div style={{fontSize:11,color:t.muted}}>{new Date(c.date).toLocaleDateString("fr-FR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
              </button>)}
            </div>
            <div style={{flex:1,padding:16,overflowY:"auto"}}>
              {preview===null?<div style={{color:t.muted,fontSize:13,paddingTop:16}}>← Sélectionne une version</div>:(
                <>
                  <button onClick={()=>{onRestore(preview);onClose();}} style={{display:"flex",alignItems:"center",gap:6,marginBottom:12,padding:"6px 12px",background:t.accent,border:"none",borderRadius:7,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}><RotateCcw size={12}/> Restaurer</button>
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

/* ── Quick Capture ── */
function QuickCapture({t,folders,password,onCreated,onClose}:{t:Theme;folders:string[];password:string;onCreated:(n:Note)=>void;onClose:()=>void}){
  const [name,setName]=useState(""); const [text,setText]=useState(""); const [folder,setFolder]=useState("notes");
  async function capture(){
    if(!name.trim())return;
    const slug=name.trim().replace(/ /g,"-").toLowerCase();
    const path=`${folder}/${slug}.md`;
    const content=text.trim()?`# ${name}\n\n${text}`:`# ${name}\n\n`;
    await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json","x-app-password":password},body:JSON.stringify({path,content})});
    onCreated({path,name:name.trim()}); onClose();
  }
  return (
    <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:60,paddingLeft:16,paddingRight:16}} onClick={onClose}>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,width:"100%",maxWidth:560,padding:20,boxShadow:t.shadow}} onClick={e=>e.stopPropagation()}>
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

/* ── Shortcuts ── */
function ShortcutsModal({t,onClose}:{t:Theme;onClose:()=>void}){
  const s=[["Ctrl+S","Sauvegarder"],["Ctrl+P","Preview"],["Ctrl+D","Split"],["F11","Focus"],["Ctrl+K","Quick capture"],["?","Raccourcis"],["Esc","Fermer"]];
  return (
    <div style={{position:"fixed",inset:0,background:"#00000088",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:24,width:"100%",maxWidth:360}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8,fontWeight:600,fontSize:15,color:t.text}}><Keyboard size={16} color={t.accent}/> Raccourcis</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:t.muted,cursor:"pointer"}}><X size={16}/></button>
        </div>
        {s.map(([k,d])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${t.border}22`}}>
            <span style={{fontSize:13,color:t.muted}}>{d}</span>
            <kbd style={{background:t.surface2,border:`1px solid ${t.border}`,borderRadius:5,padding:"2px 8px",fontSize:12,color:t.text,fontFamily:"monospace"}}>{k}</kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Note Row ── */
function NoteRow({note,active,favorites,t,onToggleFav,onClick,onRename}:{note:Note;active:Note|null;favorites:string[];t:Theme;onToggleFav:(p:string)=>void;onClick:()=>void;onRename:()=>void}){
  const isActive=active?.path===note.path,isFav=favorites.includes(note.path);
  const name=note.path.split("/").pop()?.replace(".md","")||note.name;
  const [hov,setHov]=useState(false);
  return (
    <div style={{display:"flex",alignItems:"center",marginBottom:1}} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
      <button onClick={onClick}
        style={{display:"flex",alignItems:"center",gap:7,flex:1,padding:"5px 8px",background:isActive?t.accentBg:"none",border:`1px solid ${isActive?t.accent+"33":"transparent"}`,borderRadius:7,color:isActive?"#a78bfa":t.text,fontSize:13,cursor:"pointer",textAlign:"left",minWidth:0}}
        onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background=t.hoverBg;}}
        onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background="none";}}>
        <FileText size={12} color={isActive?t.accent:t.muted} style={{flexShrink:0}}/>
        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{name}</span>
      </button>
      {(hov||isFav)&&<button onClick={e=>{e.stopPropagation();onToggleFav(note.path);}} style={{padding:"4px 5px",background:"none",border:"none",cursor:"pointer",color:isFav?"#f0b429":t.muted,flexShrink:0}}><Star size={11} fill={isFav?"#f0b429":"none"}/></button>}
    </div>
  );
}

/* ── Main ── */
type Tab = "notes"|"drive"|"dashboard";

export default function Brain(){
  const [notes,setNotes]=useState<Note[]>([]);
  const [active,setActive]=useState<Note|null>(null);
  const [tab,setTab]=useState<Tab>("notes");
  const [content,setContent]=useState("");
  const [origContent,setOrigContent]=useState("");
  const [viewMode,setViewMode]=useState<"edit"|"preview"|"split">("edit");
  const [search,setSearch]=useState("");
  const [searchResults,setSearchResults]=useState<{note:Note;excerpt:string}[]|null>(null);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [creating,setCreating]=useState(false);
  const [newName,setNewName]=useState("");
  const [newFolder,setNewFolder]=useState("notes");
  const [newTpl,setNewTpl]=useState("");
  const [renaming,setRenaming]=useState<Note|null>(null);
  const [renameTo,setRenameTo]=useState("");
  const [pw,setPw]=useState("");
  const [authed,setAuthed]=useState(false);
  const [loading,setLoading]=useState(true);
  const [dark,setDark]=useState(true);
  const [expanded,setExpanded]=useState<Set<string>>(new Set(["cybersec","projets","cours","ressources"]));
  const [favs,setFavs]=useState<string[]>([]);
  const [activeTag,setActiveTag]=useState<string|null>(null);
  const [showDL,setShowDL]=useState(false);
  const [showHistory,setShowHistory]=useState(false);
  const [showShortcuts,setShowShortcuts]=useState(false);
  const [showTOC,setShowTOC]=useState(false);
  const [showQC,setShowQC]=useState(false);
  const [focusMode,setFocusMode]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [sidebarOpen,setSidebarOpen]=useState(true);
  const [isMobile,setIsMobile]=useState(false);
  const textRef=useRef<HTMLTextAreaElement>(null);
  const t=dark?DARK:LIGHT;

  useEffect(()=>{
    const check=()=>setIsMobile(window.innerWidth<768);
    check(); window.addEventListener("resize",check);
    if(window.innerWidth<768)setSidebarOpen(false);
    return()=>window.removeEventListener("resize",check);
  },[]);

  useEffect(()=>{
    const s=sessionStorage.getItem(PASSWORD_KEY);
    if(s){setPw(s);setAuthed(true);}
    try{const f=localStorage.getItem(FAVS_KEY);if(f)setFavs(JSON.parse(f));}catch{}
    const th=localStorage.getItem(THEME_KEY);
    setDark(th!=="light");
    setLoading(false);
  },[]);

  const fetchNotes=useCallback(async()=>{
    const r=await fetch("/api/notes");
    const d=await r.json();
    setNotes(Array.isArray(d)?d:[]);
  },[]);

  useEffect(()=>{if(authed)fetchNotes();},[authed,fetchNotes]);

  function handleAuth(p:string){sessionStorage.setItem(PASSWORD_KEY,p);setPw(p);setAuthed(true);}
  function toggleTheme(){const n=!dark;setDark(n);localStorage.setItem(THEME_KEY,n?"dark":"light");}

  async function openNote(note:Note){
    const r=await fetch(`/api/notes?path=${encodeURIComponent(note.path)}`);
    const d=await r.json();
    setActive(d);setContent(d.content||"");setOrigContent(d.content||"");
    setTab("notes");setShowDL(false);setSearchResults(null);setSearch("");
    if(isMobile)setSidebarOpen(false);
  }

  async function saveNote(){
    if(!active||saving)return;
    setSaving(true);
    await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json","x-app-password":pw},body:JSON.stringify({path:active.path,content,sha:active.sha})});
    const u=await fetch(`/api/notes?path=${encodeURIComponent(active.path)}`).then(r=>r.json());
    setActive(u);setOrigContent(content);setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),2500);
  }

  async function trashNote(){
    if(!active||!confirm(`Mettre "${active.name}" à la corbeille ?`))return;
    setDeleting(true);
    const tp=active.path.replace(/^notes\//,"notes/_trash/");
    await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json","x-app-password":pw},body:JSON.stringify({path:tp,content})});
    await fetch("/api/notes",{method:"DELETE",headers:{"Content-Type":"application/json","x-app-password":pw},body:JSON.stringify({path:active.path,sha:active.sha})});
    setActive(null);setContent("");setDeleting(false);fetchNotes();
  }

  async function createNote(){
    if(!newName.trim())return;
    const slug=newName.trim().replace(/ /g,"-").toLowerCase();
    const path=`${newFolder}/${slug}.md`;
    const initial=newTpl?TEMPLATES[newTpl]:`# ${newName.trim()}\n\n`;
    await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json","x-app-password":pw},body:JSON.stringify({path,content:initial})});
    setNewName("");setCreating(false);setNewTpl("");
    await fetchNotes();await openNote({path,name:newName.trim()});
  }

  async function renameNote(){
    if(!renaming||!renameTo.trim())return;
    const parts=renaming.path.split("/");parts[parts.length-1]=renameTo.trim().replace(/ /g,"-").toLowerCase()+".md";
    const newPath=parts.join("/");
    await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json","x-app-password":pw},body:JSON.stringify({path:newPath,content:renaming.content||""})});
    if(renaming.sha)await fetch("/api/notes",{method:"DELETE",headers:{"Content-Type":"application/json","x-app-password":pw},body:JSON.stringify({path:renaming.path,sha:renaming.sha})});
    setRenaming(null);setRenameTo("");fetchNotes();
    if(active?.path===renaming.path)openNote({path:newPath,name:renameTo.trim()});
  }

  function toggleFav(path:string){const n=favs.includes(path)?favs.filter(f=>f!==path):[...favs,path];setFavs(n);localStorage.setItem(FAVS_KEY,JSON.stringify(n));}

  async function doSearch(q:string){
    if(!q.trim()){setSearchResults(null);return;}
    const res:{note:Note;excerpt:string}[]=[];
    for(const n of notes){
      if(n.name.toLowerCase().includes(q.toLowerCase())){res.push({note:n,excerpt:`📄 ${n.name}`});continue;}
      try{
        const r=await fetch(`/api/notes?path=${encodeURIComponent(n.path)}`);
        const d=await r.json();
        if(d.content?.toLowerCase().includes(q.toLowerCase())){
          const idx=d.content.toLowerCase().indexOf(q.toLowerCase());
          res.push({note:n,excerpt:"..."+d.content.slice(Math.max(0,idx-60),idx+q.length+60)+"..."});
        }
      }catch{}
    }
    setSearchResults(res);
  }

  function dlMd(){if(!active)return;const b=new Blob([content],{type:"text/markdown"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`${active.name}.md`;a.click();}
  function dlHtml(){if(!active)return;const b=new Blob([mdToHtml(content,active.name,dark)],{type:"text/html"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`${active.name}.html`;a.click();}
  function dlTxt(){if(!active)return;const b=new Blob([content],{type:"text/plain"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`${active.name}.txt`;a.click();}
  function printPdf(){if(!active)return;const w=window.open("","_blank");if(!w)return;w.document.write(mdToHtml(content,active.name,dark));w.document.close();w.onload=()=>w.print();}

  useEffect(()=>{
    function onKey(e:KeyboardEvent){
      if((e.ctrlKey||e.metaKey)&&e.key==="s"){e.preventDefault();saveNote();}
      if((e.ctrlKey||e.metaKey)&&e.key==="p"){e.preventDefault();setViewMode(v=>v==="preview"?"edit":"preview");}
      if((e.ctrlKey||e.metaKey)&&e.key==="d"){e.preventDefault();setViewMode(v=>v==="split"?"edit":"split");}
      if((e.ctrlKey||e.metaKey)&&e.key==="k"){e.preventDefault();setShowQC(true);}
      if(e.key==="F11"){e.preventDefault();setFocusMode(v=>!v);}
      if(e.key==="Escape"){setShowDL(false);setCreating(false);setShowHistory(false);setShowShortcuts(false);setShowQC(false);setRenaming(null);if(focusMode)setFocusMode(false);}
      if(e.key==="?"&&!["INPUT","TEXTAREA"].includes((e.target as Element).tagName))setShowShortcuts(true);
    }
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  });

  const isDirty=content!==origContent;
  const tree=buildTree(notes);
  const folders=Object.keys(tree.subfolders);
  const allTags=[...new Set(notes.flatMap(n=>extractTags(n.content||"")))];
  const favNotes=notes.filter(n=>favs.includes(n.path));
  const headings=active?extractHeadings(content):[];
  const displayNotes=searchResults!==null?searchResults.map(r=>r.note):activeTag?notes.filter(n=>extractTags(n.content||"").includes(activeTag)):null;

  if(loading)return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0d1117",color:"#8b949e",fontSize:14}}>chargement...</div>;
  if(!authed)return <AuthScreen onAuth={handleAuth}/>;

  return (
    <div className={dark?"":"light"} style={{display:"flex",height:"100vh",background:t.bg,color:t.text,fontFamily:"'Inter',sans-serif",overflow:"hidden"}}>

      {/* ── Sidebar ── */}
      <aside style={{
        width:260,minWidth:260,background:t.surface,borderRight:`1px solid ${t.border}`,
        display:"flex",flexDirection:"column",overflow:"hidden",
        transition:"transform .25s,width .25s",
        ...(isMobile?{position:"fixed",top:0,left:0,bottom:0,zIndex:200,transform:sidebarOpen?"translateX(0)":"translateX(-100%)",boxShadow:sidebarOpen?t.shadow:"none"}:{})
      }}>
        {/* Logo */}
        <div style={{padding:"14px 16px 10px",borderBottom:`1px solid ${t.border}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,#6e00ff,#00d4ff)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>🧠</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,fontSize:13,color:t.text,letterSpacing:"-0.3px"}}>pazent.brain</div>
              <div style={{fontSize:10,color:t.muted}}>{notes.length} notes</div>
            </div>
            <div style={{display:"flex",gap:2}}>
              <button onClick={toggleTheme} style={{background:"none",border:"none",cursor:"pointer",padding:4,borderRadius:4,fontSize:12}}>{dark?"☀️":"🌙"}</button>
              <button onClick={fetchNotes} style={{background:"none",border:"none",cursor:"pointer",color:t.muted,padding:4,borderRadius:4}}><RefreshCw size={12}/></button>
              {isMobile&&<button onClick={()=>setSidebarOpen(false)} style={{background:"none",border:"none",cursor:"pointer",color:t.muted,padding:4,borderRadius:4}}><X size={14}/></button>}
            </div>
          </div>
        </div>

        {/* Nav tabs */}
        <div style={{display:"flex",borderBottom:`1px solid ${t.border}`,flexShrink:0}}>
          {([["notes","📝"],["drive","📁"],["dashboard","📊"]] as [Tab,string][]).map(([id,icon])=>(
            <button key={id} onClick={()=>{setTab(id);if(isMobile&&id!=="notes")setSidebarOpen(false);}}
              style={{flex:1,padding:"8px 0",background:tab===id?t.accentBg:"none",border:"none",borderBottom:tab===id?`2px solid ${t.accent}`:"2px solid transparent",color:tab===id?t.accent:t.muted,fontSize:16,cursor:"pointer"}}>
              {icon}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{padding:"8px 10px 4px",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:t.inputBg,border:`1px solid ${t.border}`,borderRadius:8}}>
            <Search size={12} color={t.muted}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSearch(search)}
              placeholder="Chercher (Entrée=full text)"
              style={{background:"none",border:"none",outline:"none",color:t.text,fontSize:12,width:"100%"}}/>
            {search&&<button onClick={()=>{setSearch("");setSearchResults(null);}} style={{background:"none",border:"none",cursor:"pointer",color:t.muted,padding:0}}><X size={11}/></button>}
          </div>
        </div>

        {/* New note */}
        <div style={{padding:"4px 10px 6px",flexShrink:0}}>
          {creating?(
            <div style={{background:t.inputBg,border:`1px solid ${t.accent}44`,borderRadius:8,padding:10}}>
              <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createNote()}
                placeholder="Nom de la note..." autoFocus
                style={{width:"100%",background:"none",border:"none",outline:"none",color:t.text,fontSize:13,marginBottom:8}}/>
              <select value={newFolder} onChange={e=>setNewFolder(e.target.value)}
                style={{width:"100%",background:t.bg,border:`1px solid ${t.border}`,borderRadius:6,color:t.muted,fontSize:11,padding:"3px 6px",marginBottom:6,outline:"none"}}>
                <option value="notes">📄 Racine</option>
                {folders.map(f=><option key={f} value={`notes/${f}`}>📁 {f}</option>)}
              </select>
              <select value={newTpl} onChange={e=>setNewTpl(e.target.value)}
                style={{width:"100%",background:t.bg,border:`1px solid ${t.border}`,borderRadius:6,color:t.muted,fontSize:11,padding:"3px 6px",marginBottom:8,outline:"none"}}>
                <option value="">Pas de template</option>
                {Object.keys(TEMPLATES).map(tpl=><option key={tpl} value={tpl}>{tpl}</option>)}
              </select>
              <div style={{display:"flex",gap:6}}>
                <button onClick={createNote} style={{flex:1,padding:"5px 0",background:t.accent,border:"none",borderRadius:6,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>Créer</button>
                <button onClick={()=>setCreating(false)} style={{padding:"5px 8px",background:t.surface2,border:"none",borderRadius:6,color:t.muted,fontSize:12,cursor:"pointer"}}>✕</button>
              </div>
            </div>
          ):(
            <button onClick={()=>setCreating(true)}
              style={{display:"flex",alignItems:"center",gap:7,width:"100%",padding:"6px 10px",background:"none",border:`1px dashed ${t.border}`,borderRadius:8,color:t.muted,fontSize:12,cursor:"pointer"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=t.accent+"55";e.currentTarget.style.color=t.accent;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.muted;}}>
              <Plus size={12}/> Nouvelle note
            </button>
          )}
        </div>

        {/* Notes list */}
        <nav style={{flex:1,overflowY:"auto",padding:"2px 8px 8px"}}>
          {searchResults!==null?(
            <div>
              <div style={{padding:"4px 8px",fontSize:10,color:t.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>{searchResults.length} résultat{searchResults.length!==1?"s":""}</div>
              {searchResults.map(r=>(
                <div key={r.note.path}>
                  <NoteRow note={r.note} active={active} favorites={favs} t={t} onToggleFav={toggleFav} onClick={()=>openNote(r.note)} onRename={()=>{setRenaming(r.note);setRenameTo(r.note.name);}}/>
                  <div style={{fontSize:11,color:t.muted,padding:"0 8px 4px 26px",lineHeight:1.4}}>{r.excerpt.slice(0,100)}</div>
                </div>
              ))}
            </div>
          ):activeTag?(
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",fontSize:11,color:t.accent,fontWeight:600,marginBottom:4}}>
                <Tag size={11}/> #{activeTag} <button onClick={()=>setActiveTag(null)} style={{background:"none",border:"none",color:t.muted,cursor:"pointer",fontSize:11,marginLeft:"auto"}}>✕</button>
              </div>
              {(displayNotes||[]).map(n=><NoteRow key={n.path} note={n} active={active} favorites={favs} t={t} onToggleFav={toggleFav} onClick={()=>openNote(n)} onRename={()=>{setRenaming(n);setRenameTo(n.name);}}/>)}
            </div>
          ):(
            <>
              {favNotes.length>0&&(
                <div style={{marginBottom:8}}>
                  <div style={{padding:"4px 8px",fontSize:10,color:t.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:2}}>⭐ Favoris</div>
                  {favNotes.map(n=><NoteRow key={n.path} note={n} active={active} favorites={favs} t={t} onToggleFav={toggleFav} onClick={()=>openNote(n)} onRename={()=>{setRenaming(n);setRenameTo(n.name);}}/>)}
                  <div style={{height:1,background:t.border,margin:"6px 0"}}/>
                </div>
              )}
              {tree.notes.map(n=><NoteRow key={n.path} note={n} active={active} favorites={favs} t={t} onToggleFav={toggleFav} onClick={()=>openNote(n)} onRename={()=>{setRenaming(n);setRenameTo(n.name);}}/>)}
              {folders.map(folder=>(
                <div key={folder} style={{marginTop:4}}>
                  <div style={{display:"flex",alignItems:"center"}}>
                    <button onClick={()=>setExpanded(prev=>{const s=new Set(prev);s.has(folder)?s.delete(folder):s.add(folder);return s;})}
                      style={{display:"flex",alignItems:"center",gap:5,flex:1,padding:"4px 8px",background:"none",border:"none",color:t.muted,fontSize:11,fontWeight:600,cursor:"pointer",borderRadius:6,textTransform:"uppercase",letterSpacing:"0.5px"}}
                      onMouseEnter={e=>(e.currentTarget.style.background=t.hoverBg)}
                      onMouseLeave={e=>(e.currentTarget.style.background="none")}>
                      {expanded.has(folder)?<ChevronDown size={11}/>:<ChevronRight size={11}/>}
                      {expanded.has(folder)?<FolderOpen size={11}/>:<Folder size={11}/>}
                      {folder}
                      <span style={{marginLeft:"auto",fontSize:10,opacity:.6}}>{tree.subfolders[folder].notes.length}</span>
                    </button>
                    <button onClick={()=>{setNewFolder(`notes/${folder}`);setCreating(true);}}
                      style={{padding:"3px 4px",background:"none",border:"none",color:t.muted,cursor:"pointer",borderRadius:4,opacity:.4}}
                      onMouseEnter={e=>(e.currentTarget.style.opacity="1")} onMouseLeave={e=>(e.currentTarget.style.opacity=".4")}>
                      <Plus size={10}/>
                    </button>
                  </div>
                  {expanded.has(folder)&&(
                    <div style={{paddingLeft:12}}>
                      {tree.subfolders[folder].notes.map(n=><NoteRow key={n.path} note={n} active={active} favorites={favs} t={t} onToggleFav={toggleFav} onClick={()=>openNote(n)} onRename={()=>{setRenaming(n);setRenameTo(n.name);}}/>)}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </nav>

        {/* Tags */}
        {allTags.length>0&&(
          <div style={{padding:"8px 10px",borderTop:`1px solid ${t.border}`,flexShrink:0}}>
            <div style={{fontSize:10,color:t.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6,display:"flex",alignItems:"center",gap:5}}>
              <Tag size={10}/> Tags
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
              {allTags.map(tag=><button key={tag} onClick={()=>setActiveTag(activeTag===tag?null:tag)}
                style={{padding:"2px 7px",borderRadius:20,fontSize:10,cursor:"pointer",border:"none",background:activeTag===tag?t.accent:t.surface2,color:activeTag===tag?"#fff":t.muted}}>
                #{tag}
              </button>)}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{padding:"6px 12px",borderTop:`1px solid ${t.border}`,fontSize:11,color:t.muted,display:"flex",alignItems:"center",gap:6,cursor:"pointer",flexShrink:0}} onClick={()=>setShowShortcuts(true)}>
          <Keyboard size={11}/> Raccourcis
          <kbd style={{marginLeft:"auto",background:t.surface2,border:`1px solid ${t.border}`,borderRadius:3,padding:"1px 4px",fontSize:10}}>?</kbd>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {isMobile&&sidebarOpen&&<div onClick={()=>setSidebarOpen(false)} style={{position:"fixed",inset:0,background:"#00000066",zIndex:190}}/>}

      {/* ── Main ── */}
      <main style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>

        {/* Focus bar */}
        {focusMode&&<div style={{position:"fixed",top:0,left:0,right:0,height:3,background:"linear-gradient(90deg,#6e00ff,#00d4ff)",zIndex:100}}/>}

        {/* Topbar */}
        {!focusMode&&(
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"0 12px",height:48,borderBottom:`1px solid ${t.border}`,background:t.bg,flexShrink:0,minWidth:0}}>
            {/* Mobile menu */}
            <button onClick={()=>setSidebarOpen(!sidebarOpen)} style={{background:"none",border:"none",cursor:"pointer",color:t.muted,padding:4,flexShrink:0}}>
              <Menu size={16}/>
            </button>

            {/* Tab = drive or dashboard */}
            {tab!=="notes"&&(
              <div style={{display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
                <button onClick={()=>setTab("notes")} style={{background:"none",border:"none",cursor:"pointer",color:t.muted,padding:4,flexShrink:0}}><ArrowLeft size={14}/></button>
                <span style={{fontWeight:600,fontSize:14,color:t.text}}>{tab==="drive"?"📁 Drive":"📊 Dashboard"}</span>
              </div>
            )}

            {/* Note active */}
            {tab==="notes"&&active&&(
              <>
                <div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:t.muted,flex:1,minWidth:0,overflow:"hidden"}}>
                  {active.path.includes("/",6)&&(<span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:1}}>{active.path.replace(/^notes\//,"").split("/")[0]}</span>)}
                  {active.path.includes("/",6)&&<ChevronRight size={11} style={{flexShrink:0}}/>}
                  {renaming?.path===active.path?(
                    <input value={renameTo} onChange={e=>setRenameTo(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")renameNote();if(e.key==="Escape")setRenaming(null);}}
                      autoFocus style={{background:"none",border:"none",outline:`1px solid ${t.accent}`,borderRadius:4,color:t.text,fontSize:12,fontWeight:500,padding:"0 4px",maxWidth:150}}/>
                  ):(
                    <span style={{color:t.text,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer"}} onDoubleClick={()=>{setRenaming(active);setRenameTo(active.name);}}>
                      {active.name}
                    </span>
                  )}
                  {isDirty&&<span style={{width:6,height:6,borderRadius:"50%",background:t.accent,flexShrink:0}}/>}
                </div>

                {/* Stats (hidden on small screens) */}
                <div style={{display:"flex",alignItems:"center",gap:8,fontSize:11,color:t.muted,flexShrink:0}} className="hide-sm">
                  <span style={{display:"flex",alignItems:"center",gap:3}}><AlignLeft size={10}/>{wc(content)}</span>
                  <span style={{display:"flex",alignItems:"center",gap:3}}><Clock size={10}/>{rt(content)}m</span>
                </div>

                <div style={{display:"flex",alignItems:"center",gap:2,flexShrink:0}}>
                  {/* View toggles */}
                  <div style={{display:"flex",background:t.surface,border:`1px solid ${t.border}`,borderRadius:7,overflow:"hidden"}}>
                    {(["edit","split","preview"] as const).map(mode=>(
                      <button key={mode} onClick={()=>setViewMode(mode)}
                        style={{padding:"4px 8px",background:viewMode===mode?t.accentBg:"none",border:"none",color:viewMode===mode?t.accent:t.muted,fontSize:11,cursor:"pointer"}}>
                        {mode==="edit"&&<Edit3 size={12}/>}
                        {mode==="split"&&<Columns size={12}/>}
                        {mode==="preview"&&<Eye size={12}/>}
                      </button>
                    ))}
                  </div>
                  {headings.length>0&&<button onClick={()=>setShowTOC(!showTOC)} style={{padding:"4px 6px",background:showTOC?t.accentBg:t.surface,border:`1px solid ${showTOC?t.accent+"44":t.border}`,borderRadius:6,color:showTOC?t.accent:t.muted,cursor:"pointer"}}><ListIcon size={12}/></button>}
                  <button onClick={()=>setShowHistory(true)} style={{padding:"4px 6px",background:t.surface,border:`1px solid ${t.border}`,borderRadius:6,color:t.muted,cursor:"pointer"}}><History size={12}/></button>
                  <button onClick={()=>setFocusMode(true)} style={{padding:"4px 6px",background:t.surface,border:`1px solid ${t.border}`,borderRadius:6,color:t.muted,cursor:"pointer"}}><Maximize2 size={12}/></button>

                  {/* Export */}
                  <div style={{position:"relative"}}>
                    <button onClick={()=>setShowDL(!showDL)} style={{padding:"4px 6px",background:t.surface,border:`1px solid ${t.border}`,borderRadius:6,color:t.muted,cursor:"pointer"}}><Download size={12}/></button>
                    {showDL&&(
                      <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,background:t.surface,border:`1px solid ${t.border}`,borderRadius:10,padding:6,zIndex:100,minWidth:160,boxShadow:t.shadow}}>
                        {[{icon:<FileText size={12}/>,label:"Markdown",fn:dlMd},{icon:<Code size={12}/>,label:"HTML",fn:dlHtml},{icon:<Hash size={12}/>,label:"Texte brut",fn:dlTxt},{icon:<Download size={12}/>,label:"PDF",fn:printPdf}].map(({icon,label,fn})=>(
                          <button key={label} onClick={()=>{fn();setShowDL(false);}}
                            style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"7px 10px",background:"none",border:"none",borderRadius:6,color:t.text,fontSize:12,cursor:"pointer",textAlign:"left"}}
                            onMouseEnter={e=>(e.currentTarget.style.background=t.hoverBg)}
                            onMouseLeave={e=>(e.currentTarget.style.background="none")}>
                            <span style={{color:t.muted}}>{icon}</span>{label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Save */}
                  <button onClick={saveNote} disabled={saving||!isDirty}
                    style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",background:saved?"#00d4ff22":isDirty?t.accent:t.surface,border:`1px solid ${saved?"#00d4ff44":isDirty?"transparent":t.border}`,borderRadius:6,color:saved?"#00d4ff":isDirty?"#fff":t.muted,fontSize:12,fontWeight:600,cursor:isDirty?"pointer":"default",opacity:saving?.6:1}}>
                    {saved?<Check size={12}/>:<Save size={12}/>}
                    <span style={{display:"none"}} className="show-sm">{saved?"✓":saving?"...":"Sauv."}</span>
                  </button>

                  <button onClick={trashNote} disabled={deleting}
                    style={{padding:"4px 6px",background:"none",border:`1px solid ${t.border}`,borderRadius:6,color:t.muted,cursor:"pointer"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="#ff444444";e.currentTarget.style.color="#ff4444";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.color=t.muted;}}>
                    <Trash2 size={12}/>
                  </button>
                </div>
              </>
            )}

            {tab==="notes"&&!active&&(
              <div style={{flex:1,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:13,color:t.muted}}>Sélectionne ou crée une note</span>
                <button onClick={()=>setShowQC(true)} style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:5,padding:"5px 10px",background:t.accent,border:"none",borderRadius:7,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                  <Zap size={12}/> Rapide
                </button>
              </div>
            )}
          </div>
        )}

        {/* Markdown toolbar */}
        {tab==="notes"&&active&&viewMode==="edit"&&!focusMode&&(
          <div style={{display:"flex",alignItems:"center",gap:2,padding:"3px 12px",borderBottom:`1px solid ${t.border}`,background:t.bg,flexShrink:0,flexWrap:"wrap"}}>
            {[{icon:<Bold size={12}/>,b:"**",a:"**",ph:"gras"},{icon:<Italic size={12}/>,b:"*",a:"*",ph:"italique"},{icon:<Hash size={12}/>,b:"# ",a:"",ph:"titre"},{icon:<ListIcon size={12}/>,b:"- ",a:"",ph:"item"},{icon:<Link2 size={12}/>,b:"[",a:"](url)",ph:"lien"},{icon:<Code size={12}/>,b:"```\n",a:"\n```",ph:"code"}].map(({icon,b,a,ph},i)=>(
              <button key={i} onClick={()=>insertMd(textRef,b,a,ph)}
                style={{padding:"3px 6px",background:"none",border:"none",borderRadius:5,color:t.muted,cursor:"pointer"}}
                onMouseEnter={e=>(e.currentTarget.style.background=t.hoverBg)}
                onMouseLeave={e=>(e.currentTarget.style.background="none")}>
                {icon}
              </button>
            ))}
            <button onClick={()=>setShowQC(true)} style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4,padding:"2px 8px",background:"none",border:`1px solid ${t.border}`,borderRadius:5,color:t.muted,cursor:"pointer",fontSize:11}}>
              <Zap size={10}/> Capture
            </button>
          </div>
        )}

        {/* Content */}
        <div style={{flex:1,overflow:"hidden",display:"flex"}}>
          {tab==="dashboard"&&<Dashboard notes={notes} favorites={favs} t={t} onOpenNote={n=>{openNote(n);setTab("notes");}}/>}
          {tab==="drive"&&<DrivePanel t={t} password={pw}/>}
          {tab==="notes"&&(
            !active?(
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,color:t.muted,padding:20}}>
                <div style={{width:60,height:60,borderRadius:16,background:`linear-gradient(135deg,${t.accent}11,#00d4ff11)`,border:`1px solid ${t.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>🧠</div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:15,fontWeight:500,color:t.text,marginBottom:6}}>Aucune note sélectionnée</div>
                  <div style={{fontSize:13,color:t.muted}}>Crée ta première note ou utilise la capture rapide</div>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
                  <button onClick={()=>setCreating(true)} style={{display:"flex",alignItems:"center",gap:7,padding:"8px 16px",background:t.accent,border:"none",borderRadius:8,color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                    <Plus size={14}/> Nouvelle note
                  </button>
                  <button onClick={()=>setShowQC(true)} style={{display:"flex",alignItems:"center",gap:7,padding:"8px 16px",background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,fontSize:13,cursor:"pointer"}}>
                    <Zap size={14}/> Capture rapide
                  </button>
                </div>
              </div>
            ):(
              <>
                {(viewMode==="edit"||viewMode==="split")&&(
                  <div style={{flex:1,overflow:"hidden",borderRight:viewMode==="split"?`1px solid ${t.border}`:"none"}}>
                    <textarea ref={textRef} value={content} onChange={e=>setContent(e.target.value)}
                      style={{width:"100%",height:"100%",padding:focusMode?"50px 60px":"24px 32px",background:t.bg,color:t.text,border:"none",outline:"none",resize:"none",fontFamily:"'JetBrains Mono',monospace",fontSize:14,lineHeight:1.9,caretColor:"#00d4ff"}}
                      placeholder="Commence à écrire en Markdown..." spellCheck={false}/>
                  </div>
                )}
                {(viewMode==="preview"||viewMode==="split")&&(
                  <div style={{flex:1,overflowY:"auto",padding:focusMode?"50px 60px":"24px 40px"}}>
                    <article className="prose" style={{maxWidth:760,margin:"0 auto"}}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{content}</ReactMarkdown>
                    </article>
                  </div>
                )}
                {showTOC&&headings.length>0&&(
                  <div style={{width:190,borderLeft:`1px solid ${t.border}`,padding:"14px 10px",overflowY:"auto",background:t.bg,flexShrink:0}}>
                    <div style={{fontSize:10,fontWeight:600,color:t.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10,display:"flex",alignItems:"center",gap:5}}>
                      <ListIcon size={10}/> Sommaire <button onClick={()=>setShowTOC(false)} style={{marginLeft:"auto",background:"none",border:"none",color:t.muted,cursor:"pointer"}}><X size={10}/></button>
                    </div>
                    {headings.map((h,i)=>(
                      <button key={i} style={{display:"block",width:"100%",textAlign:"left",padding:`3px ${(h.level-1)*8}px`,background:"none",border:"none",color:h.level===1?t.text:t.muted,fontSize:h.level===1?12:11,cursor:"pointer",lineHeight:1.4,marginBottom:2,borderRadius:4}}
                        onMouseEnter={e=>(e.currentTarget.style.color=t.accent)}
                        onMouseLeave={e=>(e.currentTarget.style.color=h.level===1?t.text:t.muted)}>
                        {h.text}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )
          )}
        </div>

        {/* Focus save */}
        {focusMode&&active&&(
          <div style={{position:"fixed",bottom:20,right:20,display:"flex",gap:8,zIndex:200}}>
            <button onClick={()=>setFocusMode(false)} style={{padding:"8px 12px",background:t.surface,border:`1px solid ${t.border}`,borderRadius:8,color:t.muted,cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13}}>
              <Minimize2 size={13}/> Quitter
            </button>
            <button onClick={saveNote} disabled={saving||!isDirty}
              style={{padding:"8px 16px",background:isDirty?t.accent:t.surface,border:"none",borderRadius:8,color:isDirty?"#fff":t.muted,cursor:isDirty?"pointer":"default",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
              <Save size={13}/>{saved?"Sauvegardé ✓":"Sauvegarder"}
            </button>
          </div>
        )}
      </main>

      {/* Modals */}
      {showHistory&&active&&<HistoryModal note={active} t={t} onRestore={c=>{setContent(c);setShowHistory(false);}} onClose={()=>setShowHistory(false)}/>}
      {showShortcuts&&<ShortcutsModal t={t} onClose={()=>setShowShortcuts(false)}/>}
      {showQC&&<QuickCapture t={t} folders={folders} password={pw} onCreated={async n=>{await fetchNotes();await openNote(n);}} onClose={()=>setShowQC(false)}/>}
      {showDL&&<div onClick={()=>setShowDL(false)} style={{position:"fixed",inset:0,zIndex:50}}/>}
    </div>
  );
}
