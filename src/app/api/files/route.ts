import { NextRequest, NextResponse } from "next/server";
import { getAllFiles, getFileById, deleteFile } from "@/lib/db";
import { unlink } from "fs/promises";

export async function GET() {
  try {
    const files = getAllFiles();
    return NextResponse.json({
      files: files.map((f) => ({
        id: f.id,
        originalName: f.original_name,
        size: f.file_size,
        status: f.status,
        hasParsedData: !!f.parsed_data,
        createdAt: f.created_at,
      })),
    });
  } catch (error) {
    console.error("List files error:", error);
    return NextResponse.json(
      { error: "Failed to list files" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { fileIds } = (await request.json()) as { fileIds: number[] };

    for (const id of fileIds) {
      const file = getFileById(id);
      if (file) {
        try {
          await unlink(file.file_path);
        } catch {
          // File might already be deleted
        }
        deleteFile(id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete files" },
      { status: 500 }
    );
  }
}
