// 반 설정 파일 내보내기·가져오기. 이식 원본: legacy/js/data/store.js:165-217
import type { ClassData } from '../model/types';
import { migrateToV2, stripDangerousKeys } from '../model/migrate';

export const exportClassJSON = (data: ClassData): string => JSON.stringify(data, null, 2);

export function importClassJSON(json: string): { ok: true; data: ClassData } | { ok: false; error: string } {
  try {
    const parsed = stripDangerousKeys(JSON.parse(json));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: '자리바꾸기 설정 파일이 아닙니다.' };
    }
    // 레거시와 같이 마지막 배치는 가져오지 않는다(가져온 반은 아직 자리를 뽑지 않은 상태).
    return { ok: true, data: { ...migrateToV2(parsed), lastAssignment: null } };
  } catch {
    return { ok: false, error: '파일을 읽지 못했습니다. JSON 형식을 확인하세요.' };
  }
}
