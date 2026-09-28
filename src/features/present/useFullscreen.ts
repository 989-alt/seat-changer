// 전체 화면(Fullscreen API) 켜기·끄기(개선 스펙 3-2). 쓸 수 없는 브라우저면 supported=false.
import { useCallback, useEffect, useState } from 'react';

function currentlyFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenElement != null;
}

export function useFullscreen(): { supported: boolean; active: boolean; toggle: () => void } {
  const supported =
    typeof document !== 'undefined' &&
    document.fullscreenEnabled === true &&
    typeof document.documentElement.requestFullscreen === 'function';
  const [active, setActive] = useState(currentlyFullscreen);

  useEffect(() => {
    const onChange = () => setActive(currentlyFullscreen());
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(() => {
    try {
      const done = currentlyFullscreen() ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      // 거부(권한·사용자 제스처 없음)는 조용히 넘어간다. 화면이 그대로면 그것이 신호다.
      done.catch(() => {});
    } catch {
      // 전체 화면을 막는 환경이면 조용히 넘어간다.
    }
  }, []);

  return { supported, active, toggle };
}
