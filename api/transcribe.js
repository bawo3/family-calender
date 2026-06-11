/**
 * ★★ /api/transcribe — Groq Whisper STT 프록시 ★★
 * 프론트에서 녹음된 오디오를 받아 Groq API로 전송하고
 * 인식된 한국어 텍스트를 반환합니다.
 *
 * 환경변수: GROQ_API_KEY (groq.com에서 무료 발급)
 */

module.exports = async (req, res) => {
  // CORS 허용
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST만 허용' });
  }

  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  try {
    // (1) multipart/form-data 파싱 (Vercel serverless는 body를 Buffer로 받음)
    const { parseMultipart } = require('./_multipart');
    const { fileBuffer, fileName, language } = await parseMultipart(req);

    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ error: '오디오 파일이 없습니다.' });
    }

    // (2) Groq Whisper API 호출
    const FormData = (await import('undici')).FormData;
    const { Blob } = (await import('buffer'));

    const form = new FormData();
    form.append('file', new Blob([fileBuffer]), fileName || 'audio.webm');
    form.append('model', 'whisper-large-v3');
    form.append('language', language || 'ko');
    form.append('response_format', 'json');

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_KEY}` },
      body: form
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq API 오류:', groqRes.status, errText);
      return res.status(502).json({ error: 'STT 서비스 오류', detail: errText });
    }

    const result = await groqRes.json();
    return res.status(200).json({ text: result.text || '' });

  } catch (e) {
    console.error('transcribe 에러:', e);
    return res.status(500).json({ error: '서버 오류', detail: e.message });
  }
};
