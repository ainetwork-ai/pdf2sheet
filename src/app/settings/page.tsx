"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface PresetConfig {
  columns: Record<string, string>;
  startRow: number;
  emptyCheckColumn: string;
}

interface Preset {
  id: number;
  name: string;
  config: PresetConfig;
  is_default: number;
}

const DEFAULT_CONFIG: PresetConfig = {
  columns: {
    이름: "C",
    초과근무일시: "D",
    초과시간: "E",
    인정시간: "F",
    인정일수: "G",
    신청일: "K",
    승인일: "L",
    근무내용: "M",
  },
  startRow: 5,
  emptyCheckColumn: "C",
};

export default function SettingsPage() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [editing, setEditing] = useState<Preset | null>(null);
  const [editName, setEditName] = useState("");
  const [editConfig, setEditConfig] = useState<PresetConfig>(DEFAULT_CONFIG);
  const [isNew, setIsNew] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const fetchPresets = useCallback(async () => {
    const res = await fetch("/api/presets");
    const data = await res.json();
    setPresets(data.presets);
  }, []);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const handleAction = async (
    action: string,
    id?: number,
    name?: string,
    config?: PresetConfig
  ) => {
    try {
      const res = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id, name, config }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPresets(data.presets);
      return true;
    } catch (err) {
      showMessage(
        "error",
        err instanceof Error ? err.message : "처리 실패"
      );
      return false;
    }
  };

  const startEdit = (preset: Preset) => {
    setEditing(preset);
    setEditName(preset.name);
    setEditConfig({ ...preset.config });
    setIsNew(false);
  };

  const startNew = () => {
    setEditing(null);
    setEditName("");
    setEditConfig({ ...DEFAULT_CONFIG });
    setIsNew(true);
  };

  const handleSave = async () => {
    if (!editName.trim()) {
      showMessage("error", "프리셋 이름을 입력하세요.");
      return;
    }

    const success = isNew
      ? await handleAction("create", undefined, editName.trim(), editConfig)
      : await handleAction("update", editing!.id, editName.trim(), editConfig);

    if (success) {
      showMessage("success", isNew ? "프리셋 생성 완료" : "프리셋 수정 완료");
      setEditing(null);
      setIsNew(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (await handleAction("delete", id)) {
      showMessage("success", "프리셋 삭제 완료");
      if (editing?.id === id) {
        setEditing(null);
        setIsNew(false);
      }
    }
  };

  const handleSetDefault = async (id: number) => {
    if (await handleAction("setDefault", id)) {
      showMessage("success", "기본 프리셋 변경 완료");
    }
  };

  const updateColumnKey = (oldField: string, newField: string) => {
    setEditConfig((prev) => {
      const entries = Object.entries(prev.columns);
      const newColumns: Record<string, string> = {};
      for (const [k, v] of entries) {
        newColumns[k === oldField ? newField : k] = v;
      }
      return { ...prev, columns: newColumns };
    });
  };

  const updateColumnValue = (field: string, col: string) => {
    setEditConfig((prev) => ({
      ...prev,
      columns: { ...prev.columns, [field]: col.toUpperCase() },
    }));
  };

  const addColumn = () => {
    setEditConfig((prev) => ({
      ...prev,
      columns: { ...prev.columns, ["새 필드"]: "A" },
    }));
  };

  const removeColumn = (field: string) => {
    setEditConfig((prev) => {
      const { [field]: _, ...rest } = prev.columns;
      return { ...prev, columns: rest };
    });
  };

  const showingEditor = isNew || editing;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              컬럼 프리셋 설정
            </h1>
            <p className="text-slate-500 mt-1">
              PDF 데이터가 시트의 어느 컬럼에 들어갈지 설정합니다
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 text-sm text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            메인으로
          </Link>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg text-sm font-medium ${
              message.type === "success"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Preset List */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-slate-800">
              프리셋 목록
            </h2>
            <button
              onClick={startNew}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              + 새 프리셋
            </button>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-700">
                    {preset.name}
                  </span>
                  {preset.is_default === 1 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                      기본
                    </span>
                  )}
                  <span className="text-xs text-slate-400">
                    {Object.entries(preset.config.columns)
                      .map(([k, v]) => `${k}:${v}`)
                      .join(", ")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {preset.is_default !== 1 && (
                    <button
                      onClick={() => handleSetDefault(preset.id)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      기본으로
                    </button>
                  )}
                  <button
                    onClick={() => startEdit(preset)}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    수정
                  </button>
                  {preset.is_default !== 1 && (
                    <button
                      onClick={() => handleDelete(preset.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
            ))}
            {presets.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                프리셋이 없습니다. 새 프리셋을 만들어주세요.
              </div>
            )}
          </div>
        </section>

        {/* Editor */}
        {showingEditor && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">
              {isNew ? "새 프리셋 만들기" : `"${editing!.name}" 수정`}
            </h2>
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              {/* Name */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  프리셋 이름
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="예: 26년 3월"
                  className="w-full max-w-xs px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Column Mapping */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-slate-700">
                    컬럼 매핑
                  </label>
                  <button
                    onClick={addColumn}
                    className="px-3 py-1 text-xs bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium"
                  >
                    + 컬럼 추가
                  </button>
                </div>
                <div className="space-y-2">
                  {Object.entries(editConfig.columns).map(
                    ([field, col], idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="text"
                          value={field}
                          onChange={(e) =>
                            updateColumnKey(field, e.target.value)
                          }
                          placeholder="필드명"
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-slate-400 text-sm">→</span>
                        <input
                          type="text"
                          value={col}
                          onChange={(e) =>
                            updateColumnValue(field, e.target.value)
                          }
                          maxLength={2}
                          placeholder="열"
                          className="w-16 px-3 py-2 border border-slate-300 rounded-lg text-sm text-center font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={() => removeColumn(field)}
                          className="p-2 text-slate-400 hover:text-red-500"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Start Row & Check Column */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    시작 행
                  </label>
                  <input
                    type="number"
                    value={editConfig.startRow}
                    onChange={(e) =>
                      setEditConfig((prev) => ({
                        ...prev,
                        startRow: parseInt(e.target.value) || 1,
                      }))
                    }
                    min={1}
                    className="w-full max-w-[100px] px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    이 행부터 빈 행을 찾아 데이터 입력
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    빈 행 확인 컬럼
                  </label>
                  <input
                    type="text"
                    value={editConfig.emptyCheckColumn}
                    onChange={(e) =>
                      setEditConfig((prev) => ({
                        ...prev,
                        emptyCheckColumn: e.target.value.toUpperCase(),
                      }))
                    }
                    maxLength={2}
                    className="w-full max-w-[100px] px-3 py-2 border border-slate-300 rounded-lg text-sm text-center font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    이 컬럼이 비어있으면 빈 행으로 판단
                  </p>
                </div>
              </div>

              {/* Preview */}
              <div className="mb-6 p-4 bg-slate-50 rounded-lg">
                <p className="text-xs font-medium text-slate-500 mb-2">
                  미리보기
                </p>
                <div className="flex flex-wrap gap-1 text-xs font-mono">
                  {Object.entries(editConfig.columns)
                    .sort(([, a], [, b]) => a.localeCompare(b))
                    .map(([field, col]) => (
                      <span
                        key={field}
                        className="px-2 py-1 bg-white border border-slate-200 rounded"
                      >
                        <span className="text-blue-600">{col}</span>
                        <span className="text-slate-400">:</span>
                        <span className="text-slate-700">{field}</span>
                      </span>
                    ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                >
                  저장
                </button>
                <button
                  onClick={() => {
                    setEditing(null);
                    setIsNew(false);
                  }}
                  className="px-6 py-2 bg-white text-slate-600 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
                >
                  취소
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
