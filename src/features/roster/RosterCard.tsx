// 교사 설정 "명단" 카드. 이름 입력, 파일 불러오기(CSV/TSV/TXT/XML/HWP/HWPX), 성별 지정을
// 한자리에 모은다. legacy/js/components/student-roster.js의 기능을 그대로 옮긴다.
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { FileUp, TriangleAlert } from 'lucide-react';
import type { Gender } from '@/core/model/types';
import { getTotalSeats } from '@/core/layouts';
import { sanitizeStudents } from '@/core/model/schema';
import { PaperCard } from '@/components/cork/PaperCard';
import { WoodButton } from '@/components/cork/WoodButton';
import { useAppStore } from '@/store/useAppStore';
import { useToasts } from '@/store/useToasts';
import { detectRosterFileKind, parseRosterFile } from './parse';

const GENDER_LABEL: Record<Gender, string> = { M: '남', F: '여' };

const TEXTAREA =
  'mt-1 w-full rounded-note border-2 border-cork-dark bg-paper px-3 py-2 font-body text-sm text-ink';
const GENDER_BTN = 'rounded-[6px] border-2 border-cork-dark px-2 py-0.5 font-body text-xs font-bold';
const GENDER_BTN_ACTIVE = 'bg-chalk text-chalk-text border-[#1c3a32]';
const GENDER_BTN_IDLE = 'bg-paper-2 text-ink';

/** 이진 형식(HWP/HWPX)인지: ArrayBuffer로 읽어야 하는지 텍스트로 읽어야 하는지 가른다. */
function needsBinaryRead(filename: string): boolean {
  const kind = detectRosterFileKind(filename);
  return kind === 'hwp' || kind === 'hwpx';
}

/** FileReader로 파일을 읽는다. jsdom을 포함해 File.text()/arrayBuffer()가 없는
 * 환경에서도 동작하도록 legacy와 같은 FileReader 경로를 쓴다. */
function readFile(file: File, binary: boolean): Promise<string | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result === null) {
        reject(new Error('파일 읽기 실패'));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    if (binary) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, 'UTF-8');
  });
}

export function RosterCard() {
  const data = useAppStore((s) => s.data);
  const activeClass = useAppStore((s) => s.activeClass);
  const setStudents = useAppStore((s) => s.setStudents);
  const update = useAppStore((s) => s.update);
  const push = useToasts((s) => s.push);

  const [draft, setDraft] = useState(() => data.students.join('\n'));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaId = useId();

  // 반을 바꾸면 입력칸을 새 반의 저장된 명단으로 다시 채운다. 같은 반 안에서
  // 타이핑하는 동안에는(activeClass가 그대로) draft를 store로 덮어쓰지 않는다.
  useEffect(() => {
    setDraft(data.students.join('\n'));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 반 전환 시에만 다시 채운다
  }, [activeClass]);

  const totalSeats = getTotalSeats(data);
  const draftCount = sanitizeStudents(draft.split('\n')).length;
  const overCapacity = data.students.length > totalSeats;

  const handleSave = () => {
    const lines = draft.split('\n');
    if (sanitizeStudents(lines).length === 0) {
      push('학생 이름을 입력해 주세요.');
      return;
    }
    setStudents(lines);
    push('명단을 저장했습니다. 사라진 학생과 관련된 고정 자리·분리 규칙·성별 지정은 자동으로 정리됩니다.');
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const content = await readFile(file, needsBinaryRead(file.name));
      const names = await parseRosterFile(file.name, content);
      setDraft(names.join('\n'));
      push(`${file.name}에서 ${names.length}명을 불러왔습니다. '명단 저장'을 눌러 적용하세요.`);
    } catch (err) {
      push(err instanceof Error ? err.message : '파일을 읽을 수 없습니다.');
    }
  };

  const setGender = (name: string, gender: Gender | null) => {
    const next = { ...data.studentGenders };
    if (gender) next[name] = gender;
    else delete next[name];
    update({ studentGenders: next });
  };

  return (
    <PaperCard title="명단" tilt="l">
      <div data-card="roster">
        <div className="flex flex-wrap items-center gap-2 font-body text-sm text-ink">
          <span>
            현재 {data.students.length}명 / 좌석 {totalSeats}개
          </span>
          {overCapacity && (
            <span className="inline-flex items-center gap-1 font-body text-sm font-bold text-apple">
              <TriangleAlert size={14} aria-hidden="true" className="pointer-events-none" />
              학생 수가 좌석 수보다 많습니다.
            </span>
          )}
        </div>

        <label htmlFor={textareaId} className="mt-3 block font-body text-sm font-bold text-ink">
          학생 이름 (한 줄에 한 명씩)
        </label>
        <textarea
          id={textareaId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={8}
          className={TEXTAREA}
        />
        <p className="mt-1 font-body text-xs text-mute">입력한 이름 {draftCount}개</p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <WoodButton onClick={handleSave}>명단 저장</WoodButton>
          <WoodButton
            variant="secondary"
            icon={<FileUp size={16} aria-hidden="true" className="pointer-events-none" />}
            onClick={() => fileInputRef.current?.click()}
          >
            파일 불러오기
          </WoodButton>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,.xml,.hwpx,.hwp"
            className="hidden"
            onChange={(e) => {
              void handleFile(e);
            }}
            aria-label="파일 불러오기"
          />
        </div>
        <p className="mt-1 font-body text-xs text-mute">
          명단을 바꾸면 고정 자리·분리 규칙·성별 지정 중 사라진 학생과 관련된 항목이 자동으로 정리됩니다.
        </p>

        {data.students.length > 0 && (
          <div className="mt-3">
            <h3 className="font-hand text-[17px] font-bold text-ink">성별 지정</h3>
            <ul className="mt-1 max-h-56 space-y-1 overflow-y-auto pr-1">
              {data.students.map((name) => {
                const gender = data.studentGenders[name];
                return (
                  <li
                    key={name}
                    className="flex items-center justify-between gap-2 border-b border-cork-dark/30 py-1 font-body text-sm text-ink"
                  >
                    <span>{name}</span>
                    <span role="group" aria-label={`${name} 성별`} className="flex gap-1">
                      {(['M', 'F'] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          aria-pressed={gender === g}
                          aria-label={`${name} ${GENDER_LABEL[g]}`}
                          onClick={() => setGender(name, g)}
                          className={`${GENDER_BTN} ${gender === g ? GENDER_BTN_ACTIVE : GENDER_BTN_IDLE}`}
                        >
                          {GENDER_LABEL[g]}
                        </button>
                      ))}
                      <button
                        type="button"
                        aria-pressed={!gender}
                        aria-label={`${name} 미지정`}
                        onClick={() => setGender(name, null)}
                        className={`${GENDER_BTN} ${!gender ? GENDER_BTN_ACTIVE : GENDER_BTN_IDLE}`}
                      >
                        미지정
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </PaperCard>
  );
}
