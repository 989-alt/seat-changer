import { createDefaultData } from '@/core/model/defaults';
import type { ClassData } from '@/core/model/types';
import { stepDone, STEPS } from './progress';

function data(patch: Partial<ClassData> = {}): ClassData {
  return { ...createDefaultData(), ...patch };
}

describe('stepDone', () => {
  it('기본 데이터는 명단·규칙·검사가 모두 미완료다', () => {
    const d = stepDone(data());
    expect(d.roster).toBe(false);
    expect(d.rules).toBe(false);
    expect(d.check).toBe(false);
  });

  it('학생이 한 명이라도 있으면 명단 완료', () => {
    expect(stepDone(data({ students: ['가온'] })).roster).toBe(true);
  });

  it('좌석 수가 학생 수 이상이면 배치 완료', () => {
    const base = createDefaultData(); // 6x5 = 30석
    expect(stepDone(data({ students: Array.from({ length: 30 }, (_, i) => `학생${i}`) })).layout).toBe(true);
    expect(
      stepDone(
        data({
          students: Array.from({ length: 31 }, (_, i) => `학생${i}`),
          layoutSettings: base.layoutSettings,
        }),
      ).layout,
    ).toBe(false);
  });

  it('비활성 좌석을 빼고 센다', () => {
    const base = createDefaultData();
    const d = data({
      students: Array.from({ length: 30 }, (_, i) => `학생${i}`),
      layoutSettings: { ...base.layoutSettings, disabledSeats: [0] },
    });
    expect(stepDone(d).layout).toBe(false);
  });

  it.each<[string, Partial<ClassData>]>([
    ['고정 자리', { fixedSeats: [{ studentName: '가온', seatIndex: 0 }] }],
    ['분리 규칙', { separationRules: [{ studentA: '가온', studentB: '나린', minDistance: 2 }] }],
    ['성별 규칙', { genderRule: 'mixed' }],
    ['이력 배제 끔', { useHistoryExclusion: false }],
    ['이력 배제 횟수', { historyExcludeCount: 3 }],
  ])('%s 를 설정하면 규칙 완료', (_label, patch) => {
    expect(stepDone(data(patch)).rules).toBe(true);
  });

  it('마지막 배정이 있으면 검사 완료', () => {
    expect(stepDone(data({ lastAssignment: { mapping: { 0: '가온' }, timestamp: 1 } })).check).toBe(true);
  });

  it('단계 순서는 명단-배치-규칙-검사', () => {
    expect(STEPS.map((s) => s.key)).toEqual(['roster', 'layout', 'rules', 'check']);
  });
});
