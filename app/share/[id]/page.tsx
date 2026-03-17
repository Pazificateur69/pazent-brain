import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

async function getSharedNote(id: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_URL || "https://pazent-brain.vercel.app"}/api/share?id=${id}`, { next: { revalidate: 60 } });
  if (!res.ok) return null;
  return res.json();
}

export default async function SharePage({ params }: { params: { id: string } }) {
  const note = await getSharedNote(params.id);
  if (!note) notFound();

  return (
    <html lang="fr">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{note.title} — pazent.brain</title>
        <meta name="description" content={note.content?.slice(0, 160)} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #0d1117; color: #e6edf3; font-family: 'Inter', sans-serif; min-height: 100vh; }
          .container { max-width: 860px; margin: 0 auto; padding: 40px 24px; }
          .header { margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #21262d; }
          .badge { display: inline-flex; align-items: center; gap: 6px; background: #6e00ff18; border: 1px solid #6e00ff33; color: #a78bfa; padding: 4px 10px; border-radius: 20px; font-size: 12px; margin-bottom: 16px; }
          h1 { font-size: 2rem; font-weight: 700; color: #e6edf3; line-height: 1.3; }
          .meta { font-size: 13px; color: #8b949e; margin-top: 8px; }
          .prose { line-height: 1.8; }
          .prose h1 { font-size: 1.8rem; font-weight: 700; margin: 1.5rem 0 1rem; border-bottom: 1px solid #21262d; padding-bottom: .5rem; }
          .prose h2 { font-size: 1.4rem; font-weight: 600; margin: 1.2rem 0 .8rem; }
          .prose h3 { font-size: 1.1rem; font-weight: 500; margin: 1rem 0 .6rem; color: #00d4ff; }
          .prose p { margin-bottom: 1rem; }
          .prose code { background: rgba(110,0,255,0.12); border: 1px solid rgba(110,0,255,0.25); padding: .15em .45em; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: .85em; color: #a78bfa; }
          .prose pre { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 1.2rem; overflow-x: auto; margin: 1rem 0; }
          .prose pre code { background: none; border: none; color: #e6edf3; font-size: .9em; }
          .prose ul, .prose ol { padding-left: 1.5rem; margin-bottom: 1rem; }
          .prose li { margin-bottom: .3rem; }
          .prose blockquote { border-left: 3px solid #6e00ff; padding-left: 1rem; opacity: .75; font-style: italic; margin: 1rem 0; }
          .prose a { color: #00d4ff; text-decoration: underline; }
          .prose table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
          .prose th, .prose td { border: 1px solid #21262d; padding: .6rem 1rem; }
          .prose th { background: #161b22; font-weight: 600; }
          .prose strong { font-weight: 700; }
          .prose hr { border: none; border-top: 1px solid #21262d; margin: 1.5rem 0; }
          .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #21262d; display: flex; align-items: center; justify-content: space-between; }
          .footer-brand { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #8b949e; }
          .footer-brand span { font-weight: 600; color: #e6edf3; }
          @media (max-width: 640px) { .container { padding: 20px 16px; } h1 { font-size: 1.5rem; } }
        `}</style>
      </head>
      <body>
        <div className="container">
          <div className="header">
            <div className="badge">🧠 pazent.brain</div>
            <h1>{note.title}</h1>
            <div className="meta">
              Partagé le {new Date(note.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>

          <div className="prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {note.content}
            </ReactMarkdown>
          </div>

          <div className="footer">
            <div className="footer-brand">
              <span>🧠</span>
              <span>pazent.brain</span>
              <span style={{ color: "#8b949e", fontWeight: 400 }}>— Knowledge base d'Alessandro Gagliardi</span>
            </div>
            <a href="https://pazent-brain.vercel.app" style={{ color: "#6e00ff", fontSize: 13, textDecoration: "none" }}>Créer le tien →</a>
          </div>
        </div>
      </body>
    </html>
  );
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const note = await getSharedNote(params.id);
  if (!note) return { title: "Note non trouvée" };
  return {
    title: `${note.title} — pazent.brain`,
    description: note.content?.slice(0, 160),
  };
}
