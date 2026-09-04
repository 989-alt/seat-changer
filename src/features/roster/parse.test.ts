import zlib from 'node:zlib';
import {
  detectRosterFileKind,
  parseDelimitedRoster,
  parseHwpRoster,
  parseHwpxRoster,
  parseRosterFile,
  parseXmlRoster,
} from './parse';

// === 테스트 전용 바이너리 픽스처 빌더 ===
// legacy가 CDN JSZip으로 만들던 HWPX(zip) 픽스처를, 여기서는 표준 ZIP 포맷을
// 직접 조립해 만든다. CRC32는 parse.ts가 검증하지 않으므로 0으로 둔다.

class ByteWriter {
  private data: number[] = [];
  u8(n: number): void {
    this.data.push(n & 0xff);
  }
  u16(n: number): void {
    this.u8(n);
    this.u8(n >> 8);
  }
  u32(n: number): void {
    this.u16(n);
    this.u16(n >>> 16);
  }
  raw(bytes: Uint8Array): void {
    for (const b of bytes) this.data.push(b);
  }
  get length(): number {
    return this.data.length;
  }
  toUint8Array(): Uint8Array {
    return new Uint8Array(this.data);
  }
}

function buildZip(entries: { name: string; method: 0 | 8; data: Uint8Array }[]): ArrayBuffer {
  const w = new ByteWriter();
  const central: { name: string; method: 0 | 8; size: number; compSize: number; offset: number }[] = [];

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const offset = w.length;
    const compData = entry.method === 0 ? entry.data : new Uint8Array(zlib.deflateRawSync(Buffer.from(entry.data)));
    w.u32(0x04034b50);
    w.u16(20);
    w.u16(0);
    w.u16(entry.method);
    w.u16(0);
    w.u16(0);
    w.u32(0);
    w.u32(compData.length);
    w.u32(entry.data.length);
    w.u16(nameBytes.length);
    w.u16(0);
    w.raw(nameBytes);
    w.raw(compData);
    central.push({ name: entry.name, method: entry.method, size: entry.data.length, compSize: compData.length, offset });
  }

  const centralStart = w.length;
  for (const c of central) {
    const nameBytes = new TextEncoder().encode(c.name);
    w.u32(0x02014b50);
    w.u16(20);
    w.u16(20);
    w.u16(0);
    w.u16(c.method);
    w.u16(0);
    w.u16(0);
    w.u32(0);
    w.u32(c.compSize);
    w.u32(c.size);
    w.u16(nameBytes.length);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u32(0);
    w.u32(c.offset);
    w.raw(nameBytes);
  }
  const centralSize = w.length - centralStart;

  w.u32(0x06054b50);
  w.u16(0);
  w.u16(0);
  w.u16(entries.length);
  w.u16(entries.length);
  w.u32(centralSize);
  w.u32(centralStart);
  w.u16(0);

  const bytes = w.toUint8Array();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function utf16leBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out[i * 2] = code & 0xff;
    out[i * 2 + 1] = (code >> 8) & 0xff;
  }
  return out;
}

/** legacy parseOLE가 읽을 수 있는 최소 OLE 복합 문서(PrvText 스트림 하나)를 만든다. */
function buildFakeHwp(prvText: string): ArrayBuffer {
  const buf = new ArrayBuffer(2048);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  view.setUint16(30, 9, true); // 섹터 크기 2^9 = 512
  view.setInt32(48, 1, true); // 디렉터리 시작 섹터 = 1
  view.setInt32(76, 0, true); // DIFAT[0]: 섹터 0 = FAT
  for (let i = 1; i < 109; i++) view.setInt32(76 + i * 4, -1, true);

  const fatOffset = 512;
  view.setInt32(fatOffset + 0 * 4, -3, true);
  view.setInt32(fatOffset + 1 * 4, -2, true); // 디렉터리 섹터: 체인 끝
  view.setInt32(fatOffset + 2 * 4, -2, true); // 데이터 섹터: 체인 끝
  for (let i = 3; i < 128; i++) view.setInt32(fatOffset + i * 4, -1, true);

  const dirOffset = 1024;
  const nameUtf16 = 'PrvText\0';
  for (let i = 0; i < nameUtf16.length; i++) {
    view.setUint16(dirOffset + i * 2, nameUtf16.charCodeAt(i), true);
  }
  view.setUint16(dirOffset + 64, nameUtf16.length * 2, true);
  bytes[dirOffset + 66] = 2;
  view.setInt32(dirOffset + 116, 2, true);
  const dataBytes = utf16leBytes(prvText);
  view.setUint32(dirOffset + 120, dataBytes.length, true);

  bytes.set(dataBytes, 1536);
  return buf;
}

describe('detectRosterFileKind', () => {
  it('확장자로 종류를 판별한다', () => {
    expect(detectRosterFileKind('roster.csv')).toBe('text');
    expect(detectRosterFileKind('ROSTER.TSV')).toBe('text');
    expect(detectRosterFileKind('list.txt')).toBe('text');
    expect(detectRosterFileKind('list.xml')).toBe('xml');
    expect(detectRosterFileKind('list.hwpx')).toBe('hwpx');
    expect(detectRosterFileKind('list.hwp')).toBe('hwp');
    expect(detectRosterFileKind('list.pdf')).toBeNull();
  });
});

describe('parseDelimitedRoster', () => {
  it('헤더 없는 콤마 목록을 그대로 읽는다', () => {
    expect(parseDelimitedRoster('김철수\n이영희\n박민준')).toEqual(['김철수', '이영희', '박민준']);
  });

  it('헤더가 있으면 이름 열을 찾아서 읽는다', () => {
    const text = '번호,이름,성별\n1,김철수,남\n2,이영희,여';
    expect(parseDelimitedRoster(text)).toEqual(['김철수', '이영희']);
  });

  it('탭 구분(TSV)도 지원한다', () => {
    const text = 'name\t성별\n김철수\t남\n이영희\t여';
    expect(parseDelimitedRoster(text)).toEqual(['김철수', '이영희']);
  });

  it('따옴표로 감싼 이름의 따옴표를 벗긴다', () => {
    expect(parseDelimitedRoster('"김철수"\n\'이영희\'')).toEqual(['김철수', '이영희']);
  });

  it('빈 파일은 에러를 던진다', () => {
    expect(() => parseDelimitedRoster('   \n  \n')).toThrow('빈 파일입니다.');
  });

  it('이름을 찾을 수 없으면 에러를 던진다', () => {
    expect(() => parseDelimitedRoster('이름\n')).toThrow('이름을 찾을 수 없습니다.');
  });
});

describe('parseXmlRoster', () => {
  it('name 태그에서 이름을 읽는다', () => {
    const xml = '<roster><student><name>김철수</name></student><student><name>이영희</name></student></roster>';
    expect(parseXmlRoster(xml)).toEqual(['김철수', '이영희']);
  });

  it('태그가 없으면 속성에서 이름을 찾는다', () => {
    const xml = '<roster><row 이름="김철수"/><row 이름="이영희"/></roster>';
    expect(parseXmlRoster(xml)).toEqual(['김철수', '이영희']);
  });

  it('이름을 찾을 수 없으면 에러를 던진다', () => {
    expect(() => parseXmlRoster('<roster></roster>')).toThrow('XML에서 이름을 찾을 수 없습니다.');
  });
});

describe('parseHwpRoster', () => {
  it('OLE 매직넘버가 아니면 에러를 던진다', () => {
    const buf = new ArrayBuffer(8);
    expect(() => parseHwpRoster(buf)).toThrow('올바른 HWP 파일이 아닙니다.');
  });

  it('PrvText 스트림에서 한글 이름을 추출한다', () => {
    const buf = buildFakeHwp('김철수 이영희 프로젝트 박민준');
    expect(parseHwpRoster(buf)).toEqual(['김철수', '이영희', '박민준']);
  });

  it('이름을 찾을 수 없으면 에러를 던진다', () => {
    const buf = buildFakeHwp('프로젝트 학습 목표');
    expect(() => parseHwpRoster(buf)).toThrow('HWP에서 이름을 추출할 수 없습니다. CSV 형식을 사용해보세요.');
  });
});

describe('parseHwpxRoster', () => {
  it('저장(비압축) hp:t 텍스트에서 이름을 추출한다', async () => {
    const xml = '<hp:p><hp:run><hp:t>김철수</hp:t></hp:run><hp:run><hp:t>이영희</hp:t></hp:run></hp:p>';
    const buf = buildZip([{ name: 'Contents/section0.xml', method: 0, data: new TextEncoder().encode(xml) }]);
    await expect(parseHwpxRoster(buf)).resolves.toEqual(['김철수', '이영희']);
  });

  it('deflate로 압축된 항목도 읽는다(실제 hwpx와 동일한 압축 방식)', async () => {
    const xml = '<hp:t>김철수</hp:t><hp:t>이영희</hp:t><hp:t>박민준</hp:t>';
    const buf = buildZip([{ name: 'Contents/section0.xml', method: 8, data: new TextEncoder().encode(xml) }]);
    await expect(parseHwpxRoster(buf)).resolves.toEqual(['김철수', '이영희', '박민준']);
  });

  it('hp:t 태그가 없으면 폴백으로 한글 패턴을 추출한다', async () => {
    const xml = '<p>김철수 이영희</p>';
    const buf = buildZip([{ name: 'Contents/section0.xml', method: 0, data: new TextEncoder().encode(xml) }]);
    await expect(parseHwpxRoster(buf)).resolves.toEqual(['김철수', '이영희']);
  });

  it('ZIP 구조가 아니면 에러를 던진다', async () => {
    const buf = new TextEncoder().encode('not a zip file at all').buffer;
    await expect(parseHwpxRoster(buf)).rejects.toThrow('올바른 HWPX 파일이 아닙니다.');
  });

  it('이름을 찾을 수 없으면 에러를 던진다', async () => {
    const xml = '<p>프로젝트 학습 목표</p>';
    const buf = buildZip([{ name: 'Contents/section0.xml', method: 0, data: new TextEncoder().encode(xml) }]);
    await expect(parseHwpxRoster(buf)).rejects.toThrow('HWPX에서 이름을 찾을 수 없습니다. CSV 형식을 사용해보세요.');
  });
});

describe('parseRosterFile', () => {
  it('csv 파일 이름이면 텍스트로 파싱한다', async () => {
    await expect(parseRosterFile('roster.csv', '김철수\n이영희')).resolves.toEqual(['김철수', '이영희']);
  });

  it('xml 파일 이름이면 xml로 파싱한다', async () => {
    const xml = '<roster><name>김철수</name></roster>';
    await expect(parseRosterFile('roster.xml', xml)).resolves.toEqual(['김철수']);
  });

  it('지원하지 않는 확장자는 에러를 던진다', async () => {
    await expect(parseRosterFile('roster.pdf', '')).rejects.toThrow('지원하지 않는 파일 형식입니다. (CSV, XML, HWP, HWPX)');
  });

  it('텍스트 확장자에 ArrayBuffer를 주면 에러를 던진다', async () => {
    await expect(parseRosterFile('roster.csv', new ArrayBuffer(4))).rejects.toThrow('파일 내용을 텍스트로 읽지 못했습니다.');
  });

  it('바이너리 확장자에 문자열을 주면 에러를 던진다', async () => {
    await expect(parseRosterFile('roster.hwp', 'text')).rejects.toThrow('파일 내용을 바이너리로 읽지 못했습니다.');
  });
});
