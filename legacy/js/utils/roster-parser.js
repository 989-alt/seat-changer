// 학급 명부 파일 파서 (CSV, XML, HWPX, HWP)

export async function parseRosterFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
    return parseCSV(file);
  } else if (name.endsWith('.xml')) {
    return parseXML(file);
  } else if (name.endsWith('.hwpx')) {
    return parseHWPX(file);
  } else if (name.endsWith('.hwp')) {
    return parseHWP(file);
  }
  throw new Error('지원하지 않는 파일 형식입니다. (CSV, XML, HWP, HWPX)');
}

// === CSV / TSV 파서 ===
function parseCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result;
        // 구분자 자동 판별
        const firstLine = text.split('\n')[0] || '';
        const delimiter = firstLine.includes('\t') ? '\t' : ',';

        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) { reject(new Error('빈 파일입니다.')); return; }

        // 헤더 감지: 첫 행에 이름/성명/학생/번호 등의 키워드가 있으면 헤더로 판단
        const headerKeywords = ['이름', '성명', '학생', 'name', '번호', '학번', '반'];
        const firstRow = lines[0].toLowerCase();
        const hasHeader = headerKeywords.some(k => firstRow.includes(k));
        const startIdx = hasHeader ? 1 : 0;

        // 이름 열 찾기 (헤더가 있는 경우)
        let nameColIdx = 0;
        if (hasHeader) {
          const headers = lines[0].split(delimiter).map(h => h.trim());
          const nameIdx = headers.findIndex(h => {
            const lower = h.toLowerCase();
            return lower.includes('이름') || lower.includes('성명') || lower === 'name';
          });
          if (nameIdx >= 0) nameColIdx = nameIdx;
        }

        const names = [];
        for (let i = startIdx; i < lines.length; i++) {
          const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
          const name = cols[nameColIdx];
          if (name && name.length > 0 && name.length <= 50) {
            names.push(name);
          }
        }

        if (names.length === 0) { reject(new Error('이름을 찾을 수 없습니다.')); return; }
        resolve(names);
      } catch (e) {
        reject(new Error('CSV 파싱 실패: ' + e.message));
      }
    };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsText(file, 'UTF-8');
  });
}

// === XML 파서 ===
function parseXML(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(reader.result, 'text/xml');

        // 다양한 태그 이름으로 이름 검색
        const nameSelectors = ['name', 'Name', '이름', '성명', 'student', 'Student', '학생'];
        let names = [];

        for (const tag of nameSelectors) {
          const elements = doc.getElementsByTagName(tag);
          if (elements.length > 0) {
            for (let i = 0; i < elements.length; i++) {
              const text = elements[i].textContent.trim();
              if (text.length > 0 && text.length <= 50) {
                names.push(text);
              }
            }
            break;
          }
        }

        // 태그로 못 찾으면 속성에서 검색
        if (names.length === 0) {
          const allElements = doc.getElementsByTagName('*');
          for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i];
            for (const attr of ['name', 'Name', '이름', '성명']) {
              const val = el.getAttribute(attr);
              if (val && val.trim().length > 0 && val.trim().length <= 50) {
                names.push(val.trim());
              }
            }
          }
        }

        if (names.length === 0) { reject(new Error('XML에서 이름을 찾을 수 없습니다.')); return; }
        resolve(names);
      } catch (e) {
        reject(new Error('XML 파싱 실패: ' + e.message));
      }
    };
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsText(file, 'UTF-8');
  });
}

// === HWPX 파서 (ZIP 기반) ===
async function parseHWPX(file) {
  if (typeof JSZip === 'undefined') {
    throw new Error('HWPX 파서를 로드할 수 없습니다. 인터넷 연결을 확인하세요.');
  }

  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // HWPX 구조: Contents/section0.xml, section1.xml ...
  const names = [];
  const sectionFiles = Object.keys(zip.files).filter(f =>
    f.startsWith('Contents/section') && f.endsWith('.xml')
  ).sort();

  for (const sectionFile of sectionFiles) {
    const xml = await zip.files[sectionFile].async('string');
    // HWPX XML에서 텍스트 추출
    const textMatches = xml.match(/<hp:t[^>]*>([^<]+)<\/hp:t>/g);
    if (textMatches) {
      for (const match of textMatches) {
        const text = match.replace(/<[^>]+>/g, '').trim();
        // 이름처럼 보이는 텍스트 (2~5글자 한글)
        if (text.length >= 2 && text.length <= 10 && /^[가-힣]+$/.test(text)) {
          names.push(text);
        }
      }
    }
  }

  if (names.length === 0) {
    // 폴백: 모든 텍스트에서 한글 이름 패턴 추출
    for (const sectionFile of sectionFiles) {
      const xml = await zip.files[sectionFile].async('string');
      const allText = xml.replace(/<[^>]+>/g, ' ');
      const koreanNames = allText.match(/[가-힣]{2,5}/g) || [];
      // 일반적인 단어 필터링 (간단한 휴리스틱)
      const commonWords = ['프로젝트', '학습', '목표', '내용', '활동', '수업', '학생', '선생님', '지도', '강사', '기간', '주제', '수업기간', '지도강사'];
      for (const name of koreanNames) {
        if (!commonWords.includes(name) && name.length >= 2 && name.length <= 5) {
          names.push(name);
        }
      }
    }
  }

  // 중복 제거
  const unique = [...new Set(names)];
  if (unique.length === 0) {
    throw new Error('HWPX에서 이름을 찾을 수 없습니다. CSV 형식을 사용해보세요.');
  }
  return unique;
}

// === HWP 파서 (OLE 바이너리) ===
async function parseHWP(file) {
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  // OLE 매직넘버 확인
  if (data[0] !== 0xD0 || data[1] !== 0xCF || data[2] !== 0x11 || data[3] !== 0xE0) {
    throw new Error('올바른 HWP 파일이 아닙니다.');
  }

  try {
    // OLE Compound Document 파싱
    const ole = parseOLE(data);
    const prvTextStream = ole.getStream('PrvText');

    if (prvTextStream) {
      // PrvText: UTF-16LE 인코딩된 미리보기 텍스트
      const text = decodeUTF16LE(prvTextStream);
      const koreanNames = text.match(/[가-힣]{2,5}/g) || [];
      const commonWords = ['프로젝트', '학습', '목표', '내용', '활동', '수업', '학생', '선생님', '지도', '강사', '기간', '주제'];
      const names = koreanNames.filter(n => !commonWords.includes(n) && n.length >= 2 && n.length <= 5);
      const unique = [...new Set(names)];

      if (unique.length > 0) return unique;
    }

    throw new Error('HWP에서 이름을 추출할 수 없습니다. CSV 형식을 사용해보세요.');
  } catch (e) {
    if (e.message.includes('CSV')) throw e;
    throw new Error('HWP 파싱 실패: ' + e.message + '. CSV 형식을 사용해보세요.');
  }
}

// === OLE 간이 파서 ===
function parseOLE(data) {
  const view = new DataView(data.buffer);
  const sectorSize = 1 << view.getUint16(30, true);
  const fatSectors = view.getInt32(44, true);
  const dirStart = view.getInt32(48, true);
  const miniFatStart = view.getInt32(60, true);
  const difatStart = view.getInt32(68, true);

  // FAT 읽기
  const fatSectorList = [];
  for (let i = 0; i < 109; i++) {
    const s = view.getInt32(76 + i * 4, true);
    if (s >= 0) fatSectorList.push(s);
  }

  const fat = [];
  for (const s of fatSectorList) {
    const offset = (s + 1) * sectorSize;
    for (let i = 0; i < sectorSize / 4; i++) {
      fat.push(view.getInt32(offset + i * 4, true));
    }
  }

  function getSectorChain(start) {
    const chain = [];
    let current = start;
    const visited = new Set();
    while (current >= 0 && !visited.has(current)) {
      visited.add(current);
      chain.push(current);
      current = fat[current] !== undefined ? fat[current] : -1;
    }
    return chain;
  }

  function readStream(start, size) {
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

  // 디렉토리 읽기
  const dirChain = getSectorChain(dirStart);
  const entries = [];
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

      const type = data[entryOffset + 66];
      const startSector = view.getInt32(entryOffset + 116, true);
      const size = view.getUint32(entryOffset + 120, true);

      entries.push({ name, type, startSector, size });
    }
  }

  return {
    getStream(name) {
      const entry = entries.find(e => e.name === name);
      if (!entry || entry.startSector < 0) return null;
      return readStream(entry.startSector, entry.size);
    }
  };
}

function decodeUTF16LE(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const code = bytes[i] | (bytes[i + 1] << 8);
    if (code === 0) continue;
    if (code >= 0xD800 && code <= 0xDFFF) continue; // surrogate
    result += String.fromCharCode(code);
  }
  return result;
}
