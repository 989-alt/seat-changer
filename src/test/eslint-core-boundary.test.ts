import path from 'node:path';
import { ESLint } from 'eslint';

// ESLint 인스턴스 생성이 느려(플러그인/파서 로딩) 스위트 전체가 하나만 재사용한다.
const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfigFile: path.resolve(process.cwd(), 'eslint.config.js'),
});

async function lintCore(code: string, relPath: string) {
  const results = await eslint.lintText(code, { filePath: path.resolve(process.cwd(), relPath) });
  return results[0]?.messages ?? [];
}

// R49: 첫 lintText가 ESLint 플러그인·파서를 적재하느라 Windows에서 3~5초 걸려
// vitest 기본 5000ms를 간헐적으로 넘긴다. 스위트 전체 타임아웃을 올린다.
describe('eslint core 경계 규칙', () => {
  it("import React from 'react' 를 core에서 막는다", async () => {
    const msgs = await lintCore("import React from 'react';\nexport const v = React.version;\n", 'src/core/x.ts');
    expect(msgs.length).toBeGreaterThan(0);
  });

  it("import { jsx } from 'react/jsx-runtime' 를 core에서 막는다", async () => {
    const msgs = await lintCore("import { jsx } from 'react/jsx-runtime';\nexport const f = jsx;\n", 'src/core/x.ts');
    expect(msgs.length).toBeGreaterThan(0);
  });

  it("import { createStore } from 'zustand/vanilla' 를 core에서 막는다", async () => {
    const msgs = await lintCore(
      "import { createStore } from 'zustand/vanilla';\nexport const s = createStore;\n",
      'src/core/x.ts',
    );
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('components 상대 경로 import를 core에서 막는다', async () => {
    const msgs = await lintCore("import x from '../../components/Fake';\nexport const y = x;\n", 'src/core/x.ts');
    expect(msgs.length).toBeGreaterThan(0);
  });

  it("@/components 배럴 import(하위 경로 없이)도 core에서 막는다", async () => {
    const code = `import x from '@/components';
export const y = x;
`;
    const msgs = await lintCore(code, 'src/core/x.ts');
    expect(msgs.length).toBeGreaterThan(0);
  });

  it("@/store 배럴 import를 core에서 막는다", async () => {
    const code = `import x from '@/store';
export const y = x;
`;
    const msgs = await lintCore(code, 'src/core/x.ts');
    expect(msgs.length).toBeGreaterThan(0);
  });

  it("@/pages 배럴 import를 core에서 막는다", async () => {
    const code = `import x from '@/pages';
export const y = x;
`;
    const msgs = await lintCore(code, 'src/core/x.ts');
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('../../components 배럴 상대경로 import를 core에서 막는다', async () => {
    const code = `import x from '../../components';
export const y = x;
`;
    const msgs = await lintCore(code, 'src/core/x.ts');
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('../store 배럴 상대경로 import를 core에서 막는다', async () => {
    const code = `import x from '../store';
export const y = x;
`;
    const msgs = await lintCore(code, 'src/core/x.ts');
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('./pages 배럴 상대경로 import를 core에서 막는다', async () => {
    const code = `import x from './pages';
export const y = x;
`;
    const msgs = await lintCore(code, 'src/core/x.ts');
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('동적 import를 core에서 막는다', async () => {
    const msgs = await lintCore("export const m = () => import('react');\n", 'src/core/x.ts');
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('globalThis.window 접근을 core에서 막는다', async () => {
    const msgs = await lintCore('export const w = globalThis.window;\n', 'src/core/x.ts');
    expect(msgs.length).toBeGreaterThan(0);
  });

  it("globalThis['localStorage'] 접근을 core에서 막는다", async () => {
    const msgs = await lintCore("export const l = globalThis['localStorage'];\n", 'src/core/x.ts');
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('document 전역을 core에서 막는다', async () => {
    const msgs = await lintCore('export const d = document;\n', 'src/core/x.ts');
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('.tsx 확장자의 core 파일에도 규칙이 적용된다', async () => {
    const msgs = await lintCore("import React from 'react';\nexport const v = React.version;\n", 'src/core/y.tsx');
    expect(msgs.length).toBeGreaterThan(0);
  });

  it('순수 함수는 0건이다', async () => {
    const msgs = await lintCore('export const add = (a: number, b: number) => a + b;\n', 'src/core/x.ts');
    expect(msgs).toEqual([]);
  });

  it("import { z } from 'zod' 는 0건이다", async () => {
    const msgs = await lintCore("import { z } from 'zod';\nexport const s = z.string();\n", 'src/core/x.ts');
    expect(msgs).toEqual([]);
  });

  it('core가 아닌 src/pages/에서는 react import가 0건이다', async () => {
    const msgs = await lintCore("import React from 'react';\nexport const v = React.version;\n", 'src/pages/x.tsx');
    expect(msgs).toEqual([]);
  });
}, 20_000);
