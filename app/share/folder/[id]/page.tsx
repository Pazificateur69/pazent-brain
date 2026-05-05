import { notFound } from "next/navigation";
import FolderShareView from "./view";

interface FolderShare {
  title: string;
  folderPath: string;
  notes: { path: string; name: string; content: string; relativePath: string }[];
  createdAt: string;
}

async function getSharedFolder(id: string): Promise<FolderShare | null> {
  const base = process.env.NEXT_PUBLIC_URL || "https://pazent-brain.vercel.app";
  const res = await fetch(`${base}/api/share-folder?id=${id}`, { next: { revalidate: 60 } });
  if (!res.ok) return null;
  return res.json();
}

export default async function SharedFolderPage({ params }: { params: { id: string } }) {
  const data = await getSharedFolder(params.id);
  if (!data) notFound();
  return <FolderShareView data={data} />;
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const data = await getSharedFolder(params.id);
  if (!data) return { title: "Dossier introuvable" };
  return {
    title: `${data.title} — pazent.brain`,
    description: `${data.notes.length} note${data.notes.length > 1 ? "s" : ""} partagée${data.notes.length > 1 ? "s" : ""} depuis pazent.brain`,
  };
}
