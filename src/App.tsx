import { TeacherPage } from './pages/TeacherPage';
import { PresentPage } from './pages/PresentPage';
import { DevCorkPage } from './pages/DevCorkPage';

export type Route = 'teacher' | 'present' | 'dev-cork';

export function resolveRoute(pathname: string, hash = ''): Route {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/present') return 'present';
  if (p === '/dev/cork') return 'dev-cork';
  if (p === '/' && hash.replace('#', '') === 'student') return 'present';
  return 'teacher';
}

export function App({
  pathname = window.location.pathname,
  hash = window.location.hash,
}: {
  pathname?: string;
  hash?: string;
}) {
  const route = resolveRoute(pathname, hash);
  if (route === 'present') return <PresentPage />;
  if (route === 'dev-cork') return <DevCorkPage />;
  return <TeacherPage />;
}
