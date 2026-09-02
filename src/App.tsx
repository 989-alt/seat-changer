import { TeacherPage } from './pages/TeacherPage';
import { PresentPage } from './pages/PresentPage';
import { DevCorkPage } from './pages/DevCorkPage';

export type Route = 'teacher' | 'present' | 'dev-cork';

export function resolveRoute(pathname: string): Route {
  if (pathname.startsWith('/present')) return 'present';
  if (pathname.startsWith('/dev/cork')) return 'dev-cork';
  return 'teacher';
}

export function App({ pathname = window.location.pathname }: { pathname?: string }) {
  const route = resolveRoute(pathname);
  if (route === 'present') return <PresentPage />;
  if (route === 'dev-cork') return <DevCorkPage />;
  return <TeacherPage />;
}
