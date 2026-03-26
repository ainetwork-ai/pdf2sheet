import { NextRequest, NextResponse } from "next/server";
import {
  getAllPresets,
  createPreset,
  updatePreset,
  deletePreset,
  setDefaultPreset,
  PresetConfig,
} from "@/lib/db";

export async function GET() {
  try {
    const presets = getAllPresets();
    return NextResponse.json({
      presets: presets.map((p) => ({
        ...p,
        config: JSON.parse(p.config) as PresetConfig,
      })),
    });
  } catch (error) {
    console.error("Presets error:", error);
    return NextResponse.json({ error: "프리셋 조회 실패" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, id, name, config } = (await request.json()) as {
      action: "create" | "update" | "delete" | "setDefault";
      id?: number;
      name?: string;
      config?: PresetConfig;
    };

    switch (action) {
      case "create":
        if (!name || !config) {
          return NextResponse.json({ error: "이름과 설정이 필요합니다." }, { status: 400 });
        }
        createPreset(name, config);
        break;

      case "update":
        if (!id || !name || !config) {
          return NextResponse.json({ error: "ID, 이름, 설정이 필요합니다." }, { status: 400 });
        }
        updatePreset(id, name, config);
        break;

      case "delete":
        if (!id) {
          return NextResponse.json({ error: "ID가 필요합니다." }, { status: 400 });
        }
        deletePreset(id);
        break;

      case "setDefault":
        if (!id) {
          return NextResponse.json({ error: "ID가 필요합니다." }, { status: 400 });
        }
        setDefaultPreset(id);
        break;

      default:
        return NextResponse.json({ error: "알 수 없는 액션" }, { status: 400 });
    }

    const presets = getAllPresets();
    return NextResponse.json({
      presets: presets.map((p) => ({
        ...p,
        config: JSON.parse(p.config) as PresetConfig,
      })),
    });
  } catch (error) {
    console.error("Presets error:", error);
    const msg = error instanceof Error ? error.message : "프리셋 처리 실패";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
