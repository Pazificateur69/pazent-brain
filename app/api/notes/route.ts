import { NextRequest, NextResponse } from "next/server";
import { listNotes, getNote, saveNote, deleteNote } from "@/lib/github";

function checkAuth(req: NextRequest) {
  const auth = req.headers.get("x-app-password");
  return auth === process.env.APP_PASSWORD;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");

  if (path) {
    const note = await getNote(path);
    if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(note);
  }

  const notes = await listNotes();
  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { path, content, sha } = await req.json();
  await saveNote(path, content, sha);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { path, sha } = await req.json();
  await deleteNote(path, sha);
  return NextResponse.json({ ok: true });
}
