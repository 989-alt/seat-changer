import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';

/**
 * Phase 2 게이트용 임시 진단 블록. 계획 2에서 실제 화면으로 교체된다.
 *
 * 마운트 시 update({})를 한 번 호출해 store가 부팅 시 메모리에서만
 * 마이그레이션한 데이터를 즉시 localStorage에 다시 쓰게 한다(계획 2의
 * 실제 편집 화면에서는 어떤 조작이든 같은 저장 경로를 자연히 타므로
 * 이 호출은 임시 진단 화면에만 필요하다).
 */
function DiagBlock() {
  const classes = useAppStore((s) => s.classes);
  const activeClass = useAppStore((s) => s.activeClass);
  const students = useAppStore((s) => s.data.students.length);
  const loadNotice = useAppStore((s) => s.loadNotice);

  useEffect(() => {
    useAppStore.getState().update({});
  }, []);

  return (
    <pre data-testid="diag" className="mt-4 text-ink">
      {JSON.stringify({ classes, activeClass, students, loadNotice }, null, 2)}
    </pre>
  );
}

export function TeacherPage() {
  return (
    <main data-page="teacher" className="min-h-screen texture-cork p-8">
      <h1 className="font-hand text-4xl text-ink">자리바꾸기</h1>
      <DiagBlock />
    </main>
  );
}
