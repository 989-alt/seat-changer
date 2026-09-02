// 삭제(비활성) 좌석 관리 — 순수 함수 (DOM/store 의존 없음)
// disabledSeats: 사용자가 X로 삭제한 좌석 인덱스 배열. 항상 새 배열을 반환한다.

export function addDisabledSeat(disabledSeats, seatIndex) {
  const list = Array.isArray(disabledSeats) ? disabledSeats : [];
  if (list.includes(seatIndex)) return list.slice();
  return [...list, seatIndex];
}

export function removeDisabledSeat(disabledSeats, seatIndex) {
  const list = Array.isArray(disabledSeats) ? disabledSeats : [];
  return list.filter(i => i !== seatIndex);
}

export function clearDisabledSeats() {
  return [];
}

/**
 * 좌석 삭제를 data에 적용한 새 객체 조각 반환
 * - disabledSeats에 인덱스 추가
 * - 그 좌석에 걸린 고정 자리 해제
 * @returns {{ layoutSettings: Object, fixedSeats: Array }}
 */
export function applyDisabledSeat(data, seatIndex) {
  const layoutSettings = data.layoutSettings || {};
  return {
    layoutSettings: {
      ...layoutSettings,
      disabledSeats: addDisabledSeat(layoutSettings.disabledSeats, seatIndex)
    },
    fixedSeats: (data.fixedSeats || []).filter(f => f.seatIndex !== seatIndex)
  };
}
