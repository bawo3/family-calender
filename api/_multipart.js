/**
 * ★★ multipart/form-data 간이 파서 ★★
 * Vercel Serverless에서 오디오 파일 업로드를 처리하기 위한 헬퍼
 * 외부 의존성 없이 boundary 기반으로 파싱합니다.
 */

export function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)/);
    if (!boundaryMatch) {
      return reject(new Error('boundary를 찾을 수 없습니다.'));
    }

    const boundary = boundaryMatch[1];
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const buf = Buffer.concat(chunks);
        const parts = splitMultipart(buf, boundary);

        let fileBuffer = null;
        let fileName = 'audio.webm';
        let language = 'ko';

        for (const part of parts) {
          const header = part.header.toLowerCase();
          if (header.includes('name="file"')) {
            fileBuffer = part.body;
            // 파일명 추출
            const fnMatch = part.header.match(/filename="([^"]+)"/);
            if (fnMatch) fileName = fnMatch[1];
          } else if (header.includes('name="language"')) {
            language = part.body.toString('utf8').trim();
          }
        }

        resolve({ fileBuffer, fileName, language });
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function splitMultipart(buf, boundary) {
  const sep = Buffer.from('--' + boundary);
  const parts = [];
  let start = 0;

  while (true) {
    const idx = buf.indexOf(sep, start);
    if (idx === -1) break;

    if (start > 0) {
      // 이전 파트 처리
      const partBuf = buf.slice(start, idx);
      const part = parsePart(partBuf);
      if (part) parts.push(part);
    }

    start = idx + sep.length;
    // CRLF 또는 -- (종료) 건너뛰기
    if (buf[start] === 0x2d && buf[start + 1] === 0x2d) break; // --
    if (buf[start] === 0x0d) start += 2; // \r\n
    else if (buf[start] === 0x0a) start += 1; // \n
  }

  return parts;
}

function parsePart(buf) {
  // 헤더와 본문은 빈 줄(\r\n\r\n)로 구분
  const crlfcrlf = Buffer.from('\r\n\r\n');
  const lflf = Buffer.from('\n\n');
  let splitIdx = buf.indexOf(crlfcrlf);
  let bodyStart = 4;

  if (splitIdx === -1) {
    splitIdx = buf.indexOf(lflf);
    bodyStart = 2;
  }
  if (splitIdx === -1) return null;

  const header = buf.slice(0, splitIdx).toString('utf8');
  let body = buf.slice(splitIdx + bodyStart);

  // 끝의 CRLF 제거
  if (body.length >= 2 && body[body.length - 2] === 0x0d && body[body.length - 1] === 0x0a) {
    body = body.slice(0, -2);
  } else if (body.length >= 1 && body[body.length - 1] === 0x0a) {
    body = body.slice(0, -1);
  }

  return { header, body };
}
