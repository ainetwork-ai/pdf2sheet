import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { insertFile } from "@/lib/db";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }

    await mkdir(UPLOADS_DIR, { recursive: true });

    const results = [];

    for (const file of files) {
      if (file.type !== "application/pdf") {
        continue;
      }

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const filePath = path.join(UPLOADS_DIR, filename);

      await writeFile(filePath, buffer);

      const result = insertFile(filename, file.name, filePath, buffer.length);

      results.push({
        id: Number(result.lastInsertRowid),
        originalName: file.name,
        size: buffer.length,
        status: "uploaded",
      });
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: "No valid PDF files found" },
        { status: 400 }
      );
    }

    return NextResponse.json({ files: results });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload files" },
      { status: 500 }
    );
  }
}
