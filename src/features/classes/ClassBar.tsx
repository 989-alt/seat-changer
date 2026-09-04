// 반 전환·추가·이름변경·삭제·복제 + 설정 JSON 내보내기/가져오기.
// 화면 상단 헤더에 놓이는 가로 막대. props 없음, 스토어를 직접 읽고 쓴다.
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Copy, Download, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useToasts } from '@/store/useToasts';
import { WoodButton } from '@/components/cork/WoodButton';

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function ClassBar() {
  const classes = useAppStore((s) => s.classes);
  const activeClass = useAppStore((s) => s.activeClass);
  const addClass = useAppStore((s) => s.addClass);
  const renameClass = useAppStore((s) => s.renameClass);
  const removeClass = useAppStore((s) => s.removeClass);
  const switchClass = useAppStore((s) => s.switchClass);
  const duplicateClass = useAppStore((s) => s.duplicateClass);
  const exportJSON = useAppStore((s) => s.exportJSON);
  const importJSON = useAppStore((s) => s.importJSON);
  const push = useToasts((s) => s.push);

  const [newClassName, setNewClassName] = useState('');
  const [renamingFor, setRenamingFor] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [duplicatingFor, setDuplicatingFor] = useState<string | null>(null);
  const [duplicateValue, setDuplicateValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function startRename(name: string) {
    setDuplicatingFor(null);
    setRenamingFor(name);
    setRenameValue(name);
  }
  function cancelRename() {
    setRenamingFor(null);
    setRenameValue('');
  }
  function submitRename(oldName: string) {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== oldName) {
      const ok = renameClass(oldName, trimmed);
      if (!ok) push('같은 이름의 반이 이미 있습니다.');
    }
    cancelRename();
  }

  function startDuplicate(name: string) {
    setRenamingFor(null);
    setDuplicatingFor(name);
    setDuplicateValue(`${name} 사본`);
  }
  function cancelDuplicate() {
    setDuplicatingFor(null);
    setDuplicateValue('');
  }
  function submitDuplicate(src: string) {
    const trimmed = duplicateValue.trim();
    if (trimmed) {
      const ok = duplicateClass(src, trimmed);
      if (!ok) push('같은 이름의 반이 이미 있습니다.');
    }
    cancelDuplicate();
  }

  function handleAddSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = newClassName.trim();
    if (!trimmed) return;
    const ok = addClass(trimmed);
    if (ok) {
      setNewClassName('');
    } else {
      push('같은 이름의 반이 이미 있습니다.');
    }
  }

  function handleDelete(name: string) {
    const ok = removeClass(name);
    if (!ok) push('마지막 남은 반은 삭제할 수 없습니다.');
  }

  function handleExport() {
    const json = exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `자리바꾸기_${activeClass}_${formatDate(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const result = importJSON(text);
    if (!result.ok) {
      push(result.error ?? '가져오기에 실패했습니다.');
    }
  }

  return (
    <div data-card="classes" className="flex flex-wrap items-center gap-2 rounded-note bg-paper-2 p-2 shadow-note">
      <div role="tablist" aria-label="반 목록" className="flex flex-wrap items-center gap-1">
        {classes.map((name) => {
          const isActive = name === activeClass;
          if (renamingFor === name) {
            return (
              <form
                key={name}
                onSubmit={(e) => {
                  e.preventDefault();
                  submitRename(name);
                }}
                className="flex items-center gap-1"
              >
                <input
                  aria-label={`${name} 새 이름`}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="w-24 rounded border border-cork-dark bg-paper px-1 text-sm text-ink"
                  autoFocus
                />
                <WoodButton type="submit">확인</WoodButton>
                <WoodButton type="button" variant="secondary" onClick={cancelRename}>
                  취소
                </WoodButton>
              </form>
            );
          }
          if (duplicatingFor === name) {
            return (
              <form
                key={name}
                onSubmit={(e) => {
                  e.preventDefault();
                  submitDuplicate(name);
                }}
                className="flex items-center gap-1"
              >
                <input
                  aria-label={`${name} 복제할 이름`}
                  value={duplicateValue}
                  onChange={(e) => setDuplicateValue(e.target.value)}
                  className="w-24 rounded border border-cork-dark bg-paper px-1 text-sm text-ink"
                  autoFocus
                />
                <WoodButton type="submit">복제</WoodButton>
                <WoodButton type="button" variant="secondary" onClick={cancelDuplicate}>
                  취소
                </WoodButton>
              </form>
            );
          }
          return (
            <div key={name} className="flex items-center gap-1">
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => switchClass(name)}
                className={`rounded-note px-3 py-1.5 font-hand text-[15px] font-bold text-ink ${isActive ? 'bg-gold' : 'bg-paper'}`}
              >
                {name}
              </button>
              <button type="button" aria-label={`${name} 이름 변경`} onClick={() => startRename(name)} className="text-ink">
                <Pencil size={14} aria-hidden="true" />
              </button>
              <button type="button" aria-label={`${name} 복제`} onClick={() => startDuplicate(name)} className="text-ink">
                <Copy size={14} aria-hidden="true" />
              </button>
              <button type="button" aria-label={`${name} 삭제`} onClick={() => handleDelete(name)} className="text-ink">
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      <form onSubmit={handleAddSubmit} className="flex items-center gap-1">
        <input
          aria-label="새 반 이름"
          placeholder="새 반 이름"
          value={newClassName}
          onChange={(e) => setNewClassName(e.target.value)}
          className="w-24 rounded border border-cork-dark bg-paper px-1 text-sm text-ink"
        />
        <WoodButton type="submit" icon={<Plus size={16} aria-hidden="true" />}>
          반 추가
        </WoodButton>
      </form>

      <WoodButton type="button" variant="secondary" onClick={handleExport} icon={<Download size={16} aria-hidden="true" />}>
        내보내기
      </WoodButton>
      <WoodButton
        type="button"
        variant="secondary"
        onClick={() => fileInputRef.current?.click()}
        icon={<Upload size={16} aria-hidden="true" />}
      >
        가져오기
      </WoodButton>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          void handleImportFile(e);
        }}
      />
    </div>
  );
}
