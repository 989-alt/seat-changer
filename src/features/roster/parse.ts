// 학급 명부 파일 파서. legacy/js/utils/roster-parser.js(CSV/TSV/TXT, XML, HWPX, HWP)의
// 파싱 규칙을 순수 함수로 이식했다. 브라우저 파일 읽기(FileReader / file.arrayBuffer /
// file.text)는 RosterCard 쪽에서 하고, 여기는 이미 읽어 들인 텍스트 또는 ArrayBuffer를
// 받아 이름 배열을 돌려주는 순수 함수만 둔다.

export type RosterFileKind = 'text' | 'xml' | 'hwpx' | 'hwp';

const MAX_NAME_LEN = 50;
const KOREAN_NAME_RE = /^[가-힣]+$/;
const COMMON_WORDS = new Set([
  '프로젝트', '학습', '목표', '내용', '활동', '수업', '학생', '선생님', '지도', '강사', '기간', '주제', '수업기간', '지도강사',
]);
const HEADER_KEYWORDS = ['이름', '성명', '학생', 'name', '번호', '학번', '반'];
const XML_NAME_TAGS = ['name', 'Name', '이름', '성명', 'student', 'Student', '학생'];
const XML_NAME_ATTRS = ['name', 'Name', '이름', '성명'];

/** 파일 이름 확장자로 어떤 파서를 태울지 정한다. legacy parseRosterFile의 분기와 동일. */
export function detectRosterFileKind(filename: string): RosterFileKind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) return 'text';
  if (lower.endsWith('.xml')) return 'xml';
  if (lower.endsWith('.hwpx')) return 'hwpx';
  if (lower.endsWith('.hwp')) return 'hwp';
  return null;
}

// === CSV / TSV / TXT ===
export function parseDelimitedRoster(text: string): string[] {
  const firstLine = text.split('\n')[0] ?? '';
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error('빈 파일입니다.');

  const headerLine = lines[0] ?? '';
  const firstRow = headerLine.toLowerCase();
  const hasHeader = HEADER_KEYWORDS.some((k) => firstRow.includes(k));
  const startIdx = hasHeader ? 1 : 0;

  let nameColIdx = 0;
  if (hasHeader) {
    const headers = headerLine.split(delimiter).map((h) => h.trim());
    const nameIdx = headers.findIndex((h) => {
      const lower = h.toLowerCase();
      return lower.includes('이름') || lower.includes('성명') || lower === 'name';
    });
    if (nameIdx >= 0) nameColIdx = nameIdx;
  }

  const names: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const cols = line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''));
    const name = cols[nameColIdx];
    if (name && name.length > 0 && name.length <= MAX_NAME_LEN) {
      names.push(name);
    }
  }

  if (names.length === 0) throw new Error('이름을 찾을 수 없습니다.');
  return names;
}

// === XML ===
export function parseXmlRoster(text: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');

  const names: string[] = [];
  for (const tag of XML_NAME_TAGS) {
    const elements = doc.getElementsByTagName(tag);
    if (elements.length > 0) {
      for (let i = 0; i < elements.length; i++) {
        const value = (elements[i]?.textContent ?? '').trim();
        if (value.length > 0 && value.length <= MAX_NAME_LEN) names.push(value);
      }
      break;
    }
  }

  if (names.length === 0) {
    const allElements = doc.getElementsByTagName('*');
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      if (!el) continue;
      for (const attr of XML_NAME_ATTRS) {
        const val = el.getAttribute(attr);
        if (val && val.trim().length > 0 && val.trim().length <= MAX_NAME_LEN) {
          names.push(val.trim());
        }
      }
    }
  }

  if (names.length === 0) throw new Error('XML에서 이름을 찾을 수 없습니다.');
  return names;
}

// === HWP (OLE 복합 문서) ===
interface OleEntry {
  name: string;
  startSector: number;
  size: number;
}

interface OleDocument {
  getStream(name: string): Uint8Array | null;
}

function parseOLE(data: Uint8Array): OleDocument {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const sectorSize = 1 << view.getUint16(30, true);
  const dirStart = view.getInt32(48, true);

  const fatSectorList: number[] = [];
  for (let i = 0; i < 109; i++) {
    const s = view.getInt32(76 + i * 4, true);
    if (s >= 0) fatSectorList.push(s);
  }

  const fat: number[] = [];
  for (const s of fatSectorList) {
    const offset = (s + 1) * sectorSize;
    for (let i = 0; i < sectorSize / 4; i++) {
      fat.push(view.getInt32(offset + i * 4, true));
    }
  }

  function getSectorChain(start: number): number[] {
    const chain: number[] = [];
    let current = start;
    const visited = new Set<number>();
    while (current >= 0 && !visited.has(current)) {
      visited.add(current);
      chain.push(current);
      const next = fat[current];
      current = next !== undefined ? next : -1;
    }
    return chain;
  }

  function readStream(start: number, size: number): Uint8Array {
    const chain = getSectorChain(start);
    const result = new Uint8Array(size);
    let pos = 0;
    for (const sector of chain) {
      const offset = (sector + 1) * sectorSize;
      const remaining = size - pos;
      const toCopy = Math.min(remaining, sectorSize);
      result.set(data.slice(offset, offset + toCopy), pos);
      pos += toCopy;
      if (pos >= size) break;
    }
    return result;
  }

  const dirChain = getSectorChain(dirStart);
  const entries: OleEntry[] = [];
  for (const sector of dirChain) {
    const offset = (sector + 1) * sectorSize;
    for (let i = 0; i < sectorSize / 128; i++) {
      const entryOffset = offset + i * 128;
      const nameLen = view.getUint16(entryOffset + 64, true);
      if (nameLen === 0) continue;

      let name = '';
      for (let j = 0; j < (nameLen - 2) / 2; j++) {
        name += String.fromCharCode(view.getUint16(entryOffset + j * 2, true));
      }

      const startSector = view.getInt32(entryOffset + 116, true);
      const size = view.getUint32(entryOffset + 120, true);
      entries.push({ name, startSector, size });
    }
  }

  return {
    getStream(name: string): Uint8Array | null {
      const entry = entries.find((e) => e.name === name);
      if (!entry || entry.startSector < 0) return null;
      return readStream(entry.startSector, entry.size);
    },
  };
}

function decodeUTF16LE(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    if (b0 === undefined || b1 === undefined) break;
    const code = b0 | (b1 << 8);
    if (code === 0) continue;
    if (code >= 0xd800 && code <= 0xdfff) continue; // 서로게이트 쌍은 건너뛴다
    result += String.fromCharCode(code);
  }
  return result;
}

export function parseHwpRoster(buffer: ArrayBuffer): string[] {
  const data = new Uint8Array(buffer);
  if (data[0] !== 0xd0 || data[1] !== 0xcf || data[2] !== 0x11 || data[3] !== 0xe0) {
    throw new Error('올바른 HWP 파일이 아닙니다.');
  }

  const ole = parseOLE(data);
  const prvTextStream = ole.getStream('PrvText');
  if (prvTextStream) {
    const text = decodeUTF16LE(prvTextStream);
    const koreanNames = text.match(/[가-힣]{2,5}/g) ?? [];
    const names = koreanNames.filter((n) => !COMMON_WORDS.has(n) && n.length >= 2 && n.length <= 5);
    const unique = [...new Set(names)];
    if (unique.length > 0) return unique;
  }

  throw new Error('HWP에서 이름을 추출할 수 없습니다. CSV 형식을 사용해보세요.');
}

// === HWPX (ZIP 기반) ===
// legacy는 CDN에서 불러온 JSZip에 의존했지만, v2는 새 의존성을 추가하지 않는다.
// 대신 표준 Compression Streams API(DecompressionStream)와 ZIP 중앙 디렉터리를
// 직접 읽는 최소 구현으로 같은 결과를 낸다.
interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

function findEndOfCentralDirectory(view: DataView): number {
  const minSize = 22;
  const maxCommentLen = 65535;
  const start = Math.max(0, view.byteLength - minSize - maxCommentLen);
  for (let i = view.byteLength - minSize; i >= start; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) return i;
  }
  throw new Error('올바른 HWPX 파일이 아닙니다.');
}

function readCentralDirectoryEntries(bytes: Uint8Array, view: DataView): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(view);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  const entries: ZipEntry[] = [];
  let offset = centralDirOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (view.getUint32(offset, true) !== CENTRAL_DIR_SIGNATURE) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameBytes = bytes.slice(offset + 46, offset + 46 + nameLen);
    const name = new TextDecoder('utf-8').decode(nameBytes);
    entries.push({ name, method, compressedSize, localHeaderOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function extractLocalFileData(bytes: Uint8Array, view: DataView, entry: ZipEntry): Uint8Array {
  const offset = entry.localHeaderOffset;
  if (view.getUint32(offset, true) !== LOCAL_FILE_SIGNATURE) {
    throw new Error('HWPX 압축 구조를 읽을 수 없습니다.');
  }
  const nameLen = view.getUint16(offset + 26, true);
  const extraLen = view.getUint16(offset + 28, true);
  const dataStart = offset + 30 + nameLen + extraLen;
  return bytes.slice(dataStart, dataStart + entry.compressedSize);
}

async function readAllChunks(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  // DecompressionStream의 lib.dom 타입(Uint8Array<ArrayBufferLike>)이 ReadableStream<Uint8Array>의
  // 엄격한 제네릭과 어긋나므로(양쪽 다 표준 스펙대로 동작함), 여기서만 캐스트로 우회한다.
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const stream = source.pipeThrough(new DecompressionStream('deflate-raw')) as ReadableStream<Uint8Array>;
  return readAllChunks(stream);
}

async function readZipEntryText(bytes: Uint8Array, view: DataView, entry: ZipEntry): Promise<string> {
  const raw = extractLocalFileData(bytes, view, entry);
  const decoded = entry.method === 0 ? raw : await inflateRaw(raw);
  return new TextDecoder('utf-8').decode(decoded);
}

export async function parseHwpxRoster(buffer: ArrayBuffer): Promise<string[]> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entries = readCentralDirectoryEntries(bytes, view);

  // HWPX 구조: Contents/section0.xml, section1.xml ...
  const sectionEntries = entries
    .filter((e) => e.name.startsWith('Contents/section') && e.name.endsWith('.xml'))
    .sort((a, b) => a.name.localeCompare(b.name));

  const names: string[] = [];
  for (const entry of sectionEntries) {
    const xml = await readZipEntryText(bytes, view, entry);
    const textMatches = xml.match(/<hp:t[^>]*>([^<]+)<\/hp:t>/g) ?? [];
    for (const match of textMatches) {
      const text = match.replace(/<[^>]+>/g, '').trim();
      // 이름처럼 보이는 텍스트 (2~10글자 한글)
      if (text.length >= 2 && text.length <= 10 && KOREAN_NAME_RE.test(text)) {
        names.push(text);
      }
    }
  }

  if (names.length === 0) {
    // 폴백: 모든 텍스트에서 한글 이름 패턴 추출
    for (const entry of sectionEntries) {
      const xml = await readZipEntryText(bytes, view, entry);
      const allText = xml.replace(/<[^>]+>/g, ' ');
      const koreanNames = allText.match(/[가-힣]{2,5}/g) ?? [];
      for (const name of koreanNames) {
        if (!COMMON_WORDS.has(name) && name.length >= 2 && name.length <= 5) {
          names.push(name);
        }
      }
    }
  }

  const unique = [...new Set(names)];
  if (unique.length === 0) {
    throw new Error('HWPX에서 이름을 찾을 수 없습니다. CSV 형식을 사용해보세요.');
  }
  return unique;
}

/** 파일 이름과 이미 읽은 내용(텍스트 또는 ArrayBuffer)으로부터 이름 배열을 돌려준다. */
export async function parseRosterFile(filename: string, content: string | ArrayBuffer): Promise<string[]> {
  const kind = detectRosterFileKind(filename);
  if (kind === null) throw new Error('지원하지 않는 파일 형식입니다. (CSV, XML, HWP, HWPX)');

  if (kind === 'text' || kind === 'xml') {
    if (typeof content !== 'string') throw new Error('파일 내용을 텍스트로 읽지 못했습니다.');
    return kind === 'text' ? parseDelimitedRoster(content) : parseXmlRoster(content);
  }

  if (typeof content === 'string') throw new Error('파일 내용을 바이너리로 읽지 못했습니다.');
  return kind === 'hwp' ? parseHwpRoster(content) : parseHwpxRoster(content);
}
