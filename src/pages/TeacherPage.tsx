import { useAppStore } from '@/store/useAppStore';

/**
 * Phase 2 게이트용 임시 진단 블록. 계획 2에서 실제 화면으로 교체된다.
 *
 * R85: v1 데이터의 마이그레이션 재저장은 store(useAppStore.ts의 loadFor)의
 * 책임이다. 이 블록은 store가 이미 읽어 둔 상태를 그대로 보여줄 뿐, 저장을
 * 유발하는 어떤 부수 효과도 갖지 않는다.
 */
function DiagBlock() {
  const classes = useAppStore((s) => s.classes);
  const activeClass = useAppStore((s) => s.activeClass);
  const students = useAppStore((s) => s.data.students.length);
  const loadNotice = useAppStore((s) => s.loadNotice);

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
