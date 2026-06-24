/**
 * ★★ /api/correct — 음성 인식 결과 보정 (Groq LLM) ★★
 * STT로 인식된 텍스트를 LLM이 캘린더 명령으로 교정/해석합니다.
 * 발음이 뭉개지거나 조사가 빠져도 의도를 파악하여 깔끔한 문장으로 변환.
 *
 * 환경변수: GROQ_API_KEY
 */

export default async function handler(req, res) {
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
    const { text } = req.body || {};
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: '텍스트가 없습니다.' });
    }

    // (1) Groq LLM으로 보정 요청
    const systemPrompt = `당신은 음성 인식 결과를 교정하는 도우미입니다.
사용자가 가족 캘린더 앱에서 음성으로 말한 내용이 STT를 거쳐 텍스트로 변환되었습니다.
발음이 뭉개지거나, 조사가 빠지거나, 비슷한 소리로 잘못 인식된 경우가 많습니다.

당신의 역할:
1. 원래 의도를 파악하여 자연스러운 한국어 문장으로 교정합니다.
2. 캘린더 관련 명령(일정 조회/등록/삭제)으로 해석합니다.
3. 날짜, 시간, 일정 내용을 최대한 살립니다.

규칙:
- 교정된 문장만 출력하세요. 설명이나 따옴표 없이 한 줄로.
- 의미를 추측할 수 없으면 원문을 그대로 반환하세요.
- 날짜 표현은 "X월 Y일" 형태를 유지하세요.

예시:
입력: "내일 병원 가" → 출력: "내일 병원 등록해줘"
입력: "유월 시보일 모임 너어줘" → 출력: "6월 15일에 모임 넣어줘"
입력: "오늘 일정 머있어" → 출력: "오늘 일정 뭐 있어"
입력: "다음주 월요일 회의 잡아" → 출력: "다음 주 월요일 회의 잡아줘"
입력: "이번주 일정 확인" → 출력: "이번 주 일정 확인"`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text.trim() }
        ],
        temperature: 0.1,
        max_tokens: 150
      })
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq LLM 오류:', groqRes.status, errText);
      // 보정 실패 시 원문 그대로 반환
      return res.status(200).json({ corrected: text.trim(), original: text.trim(), changed: false });
    }

    const result = await groqRes.json();
    const corrected = (result.choices?.[0]?.message?.content || '').trim();

    // (2) 보정 결과가 비어있거나 너무 길면 원문 반환
    if (!corrected || corrected.length > text.length * 3) {
      return res.status(200).json({ corrected: text.trim(), original: text.trim(), changed: false });
    }

    return res.status(200).json({
      corrected,
      original: text.trim(),
      changed: corrected !== text.trim()
    });

  } catch (e) {
    console.error('correct 에러:', e);
    // 에러 시에도 원문 반환 (서비스 중단 방지)
    return res.status(200).json({
      corrected: (req.body?.text || '').trim(),
      original: (req.body?.text || '').trim(),
      changed: false
    });
  }
}
