// 모둠 이름·역할 설정 카드 (계약서 3-4). 모둠 배치일 때만 보인다.
// 실제 역할 배정은 발표 화면에서 assignRoles로 한다. 이 카드는 설정만 맡는다.
import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { PaperCard } from '@/components/cork/PaperCard';
import { WoodButton } from '@/components/cork/WoodButton';
import { useAppStore } from '@/store/useAppStore';
import { getLayout } from '@/core/layouts';
import { DEFAULT_ROLES, GROUP_NAME_PRESETS, pickGroupNames } from '@/core/groups/roles';
import { useGroupSettings, type NameSource } from './useGroupSettings';

const SOURCE_OPTIONS: { value: NameSource; label: string }[] = [
  { value: 'custom', label: '직접 입력' },
  { value: 'animal', label: '동물' },
  { value: 'color', label: '색' },
  { value: 'planet', label: '행성' },
  { value: 'fruit', label: '과일' },
];

export function GroupsCard() {
  const layoutType = useAppStore((s) => s.data.layoutType);
  const layoutSettings = useAppStore((s) => s.data.layoutSettings);
  const activeClass = useAppStore((s) => s.activeClass);

  const settings = useGroupSettings((s) => s.settings);
  const load = useGroupSettings((s) => s.load);
  const setNameSource = useGroupSettings((s) => s.setNameSource);
  const setNames = useGroupSettings((s) => s.setNames);
  const setRoles = useGroupSettings((s) => s.setRoles);

  const [newRole, setNewRole] = useState('');

  useEffect(() => {
    load(activeClass);
  }, [activeClass, load]);

  const groupCount = useMemo(() => {
    if (layoutType !== 'group') return 0;
    const positions = getLayout('group').getSeatPositions(layoutSettings);
    const indexes = new Set(positions.map((p) => p.groupIndex ?? 0));
    return indexes.size;
  }, [layoutType, layoutSettings]);

  if (layoutType !== 'group') return null;

  const rollNames = (source: NameSource) => {
    if (source === 'custom') {
      setNameSource('custom');
      return;
    }
    setNameSource(source);
    setNames(pickGroupNames(groupCount, GROUP_NAME_PRESETS[source]));
  };

  const renameGroup = (i: number, value: string) => {
    const next = Array.from({ length: groupCount }, (_, k) => settings.names[k] ?? '');
    next[i] = value;
    setNames(next);
  };

  const renameRole = (i: number, value: string) => {
    setRoles(settings.roles.map((r, k) => (k === i ? value : r)));
  };

  const removeRole = (i: number) => setRoles(settings.roles.filter((_, k) => k !== i));

  const addRole = () => {
    const name = newRole.trim();
    if (!name || settings.roles.includes(name)) return;
    setRoles([...settings.roles, name]);
    setNewRole('');
  };

  const inputClass =
    'rounded-[6px] border-2 border-cork-dark bg-paper px-2 py-1 font-body text-[14px] text-ink';
  const legendClass = 'font-hand text-[17px] font-bold text-ink';
  const hintClass = 'mt-2 font-body text-[13px] text-mute';
  const iconBtnClass = 'rounded-[4px] border border-cork-dark bg-paper p-1 text-ink';
  const canAddRole = newRole.trim().length > 0 && !settings.roles.includes(newRole.trim());

  return (
    <div data-card="groups">
      <PaperCard title="모둠 이름·역할">
        <div className="space-y-5">
          <fieldset>
            <legend className={legendClass}>모둠 이름</legend>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                aria-label="모둠 이름 종류"
                className={inputClass}
                value={settings.nameSource}
                onChange={(e) => rollNames(e.target.value as NameSource)}
              >
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <WoodButton
                variant="secondary"
                icon={<RefreshCw size={16} aria-hidden className="pointer-events-none" />}
                disabled={settings.nameSource === 'custom' || groupCount === 0}
                onClick={() => rollNames(settings.nameSource)}
              >
                이름 다시 뽑기
              </WoodButton>
            </div>
            {groupCount === 0 ? (
              <p className={hintClass}>모둠이 아직 없습니다. 배치에서 모둠 수를 정하세요.</p>
            ) : (
              <ul className="mt-2 grid grid-cols-2 gap-2">
                {Array.from({ length: groupCount }, (_, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="font-body text-[13px] text-mute">{i + 1}모둠</span>
                    <input
                      aria-label={`${i + 1}모둠 이름`}
                      className={`${inputClass} w-full`}
                      value={settings.names[i] ?? ''}
                      onChange={(e) => renameGroup(i, e.target.value)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <fieldset>
            <legend className={legendClass}>역할</legend>
            <ul className="mt-2 space-y-1">
              {settings.roles.map((role, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input
                    aria-label={`${i + 1}번째 역할 이름`}
                    className={`${inputClass} w-full`}
                    value={role}
                    onChange={(e) => renameRole(i, e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={`${role} 역할 삭제`}
                    className={iconBtnClass}
                    onClick={() => removeRole(i)}
                  >
                    <Trash2 size={16} aria-hidden className="pointer-events-none" />
                  </button>
                </li>
              ))}
            </ul>
            {settings.roles.length === 0 && <p className={hintClass}>역할이 없습니다.</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                aria-label="새 역할 이름"
                className={inputClass}
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
              />
              <WoodButton
                variant="secondary"
                icon={<Plus size={16} aria-hidden className="pointer-events-none" />}
                disabled={!canAddRole}
                onClick={addRole}
              >
                역할 추가
              </WoodButton>
              <WoodButton variant="secondary" onClick={() => setRoles([...DEFAULT_ROLES])}>
                기본 역할로 되돌리기
              </WoodButton>
            </div>
          </fieldset>
        </div>
      </PaperCard>
    </div>
  );
}
