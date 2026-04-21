# 오늘의 교사 운세 (meal n stroll 부가기능) — Planning

## 0. 핵심 요약

meal n stroll 웹사이트에 **"오늘의 교사 운세"** 모달 기능을 추가한다.

- 메인 화면에 `🔮 오늘의 교사 운세` 버튼 한 개 추가
- 버튼 클릭 시 모달 오픈
- 최초 방문자: 입력 폼 → 결과 화면
- 재방문자: localStorage에 저장된 정보로 **바로 결과 화면** (날짜 기반 시드라 매일 내용 바뀜)
- 로그인 없음. 모든 데이터는 브라우저 localStorage에만 저장
- 기술 스택: meal n stroll의 기존 스택(HTML/CSS/JS 또는 React)에 맞춰 동일하게 구현

---

## 1. 설계 철학

- **정교한 랜덤**: 실제 사주 계산은 하지 않는다. 생년월일시·성별·날짜를 해시해서 시드로 사용하고, 입력값(학교급·담임·교과군) 태그에 맞는 운세 풀에서만 뽑는다. 결과가 "나에게 맞춰진 것 같은" 느낌을 주는 게 목표.
- **하루 고정**: 같은 사용자가 같은 날 새로고침해도 **항상 같은 결과**가 나와야 한다. 결과가 바뀌면 신뢰도가 즉시 붕괴된다.
- **입력 1회, 결과 평생**: localStorage에 저장된 개인 정보는 사용자가 직접 수정하기 전까지 유지된다.
- **공유 중심**: 결과 모달은 캡처·공유를 염두에 둔 레이아웃이어야 한다. 단톡방 공유가 실제 확산 경로.
- **긍정 톤 유지 (중요)**: 모든 운세 문장은 **긍정적·격려하는 톤**으로만 작성한다. "주의", "조심", "실수", "~할 확률이 있음", "피곤해 보입니다" 같은 부정·경고 표현은 쓰지 않는다.
  - ❌ "공문 속 '긴급'이라는 단어를 조심할 것"
  - ✅ "공문 속 '긴급'이라는 단어도 차분히 넘길 수 있는 여유가 있는 날"
  - 별점이 낮은 카테고리라도 **문장 자체는 응원과 격려의 톤**이어야 한다. 낮은 별점은 행운의 **강도 차이**일 뿐 '나쁨'이 아니다. 예: "오늘은 평온한 날" (2점), "작은 즐거움이 기다리는 날" (3점), "기대 이상의 하루" (5점).
  - 학교 일상의 소소한 해프닝(분필 부러짐, 학생 장난 등)도 "웃어넘길 수 있다", "재미있게 풀린다" 같은 프레임으로 긍정 전환.
  - 운세 앱의 핵심 가치는 **열 때마다 기분이 좋아지는 것**이다.

---

## 2. UX 플로우

```
[meal n stroll 메인 화면]
        │
        │ [🔮 오늘의 교사 운세] 버튼 클릭
        ▼
┌───────────────────────────────┐
│  localStorage에 저장된 정보?    │
└───────────────────────────────┘
    │NO                  │YES
    ▼                    ▼
[입력 폼 모달]      [결과 모달 바로 표시]
    │                    │
    │ [오늘의 운세 보기]    │ (하단에 "정보 수정" 링크)
    ▼                    │
[결과 모달]  ─────────────┘
    │
    ├─ [📸 이미지 저장]
    ├─ [🔗 공유하기]
    ├─ [정보 수정] → 입력 폼 모달로 이동
    └─ [닫기]
```

---

## 3. 입력 폼 스펙

### 3.1 입력 항목

| 항목 | UI | 비고 |
|---|---|---|
| 생년월일 | 년(4자리) / 월 / 일 셀렉트 | 1940~현재년도 |
| 태어난 시각 | 시 셀렉트 (0~23시 + "모름" 옵션) | "모름" 선택 시 시주 미반영 |
| 성별 | 라디오 버튼 (남/여) | 운세 표현 미세 조정용 |
| 학교급 | 라디오 버튼 (초등/중등/고등) | 학년 드롭다운 동적 변경 트리거 |
| 담임 여부 | 셀렉트 (비담임/1학년/2학년/...) | 학교급에 따라 동적 변경 (초 1~6, 중·고 1~3) |
| 담당 교과군 | 셀렉트 | 아래 10개 옵션 |

### 3.2 교과군 옵션 (10개)

1. 국어
2. 수학
3. 영어
4. 사회 (역사·도덕·일반사회·지리·통합사회 포함)
5. 과학 (물·화·생·지·통합과학 포함)
6. 체육
7. 예술 (음악·미술)
8. 기술·가정·정보
9. 제2외국어·한문
10. 전문교과 (특성화·예체능고 등)

### 3.3 검증 규칙

- 생년월일: 미래 날짜 불가, 실존하는 날짜만 허용 (예: 2월 30일 불가)
- 모든 필드 필수 (단, "태어난 시각"의 "모름"은 유효한 값)
- 검증 실패 시 해당 필드 하단에 빨간색 짧은 메시지

### 3.4 localStorage 저장

```javascript
localStorage.setItem('teacherFortune_profile', JSON.stringify({
  birthYear: 1988,
  birthMonth: 3,
  birthDay: 15,
  birthHour: 10,     // null이면 "모름"
  gender: 'M',       // 'M' | 'F'
  schoolLevel: 'H',  // 'E' 초등 | 'M' 중등 | 'H' 고등
  homeroom: 2,       // number (학년) | 0 (비담임)
  subject: 'social'  // key 값 (아래 섹션 5.3 참고)
}));
```

---

## 4. 결과 모달 스펙

### 4.1 레이아웃 (위에서 아래로)

```
╔═══════════════════════════════════════╗
║  2026년 4월 21일 (丙午日·병오일)        ║   ← 헤더
║  오늘의 교사 운세                        ║
║  ─────────────────────────────────    ║
║                                       ║
║   ✨ 총운  ⭐⭐⭐⭐☆                    ║   ← 총평 (별점 크게)
║   "오늘은 교무실의 주인공이 될 운"        ║
║                                       ║
║  ─────────────────────────────────    ║
║   📚 수업운  ⭐⭐⭐⭐⭐                  ║
║   3교시 판서가 유난히 예쁘게 써진다.      ║
║                                       ║
║   🎒 학생운  ⭐⭐⭐☆☆                  ║
║   질문이 많은 날. 성장하는 증거입니다.     ║
║                                       ║
║   ☕ 교무실운  ⭐⭐⭐⭐☆                ║
║   오늘은 누가 커피를 사줄 가능성이 있음.  ║
║                                       ║
║   📋 업무운  ⭐⭐☆☆☆                  ║
║   조용히 흐르는 하루. 여유가 함께합니다.   ║
║                                       ║
║   💰 금전운  ⭐⭐⭐⭐⭐                  ║
║   예상치 못한 입금 소식이 들려올 날.      ║
║                                       ║
║   🍀 오늘의 행운템                       ║
║   빨간 볼펜 — 책상 가장 가까이 두세요.   ║
║                                       ║
║   📜 오늘의 한 줄                        ║
║   "勞課以咖, 日日新也"                   ║
║   — 수업은 커피로, 하루는 새롭게          ║
║                                       ║
║   💡 오늘의 꿀팁                         ║
║   3교시 시작 전에 물 한 잔. 목이 먼저     ║
║   살아야 수업도 산다.                    ║
║                                       ║
║  ─────────────────────────────────    ║
║  [📸 이미지 저장] [🔗 공유] [수정] [닫기] ║
╚═══════════════════════════════════════╝
```

### 4.2 별점 규칙

- 각 카테고리마다 1~5점 (0점은 없음 — 너무 기분 나쁨)
- 분포: 1점 5%, 2점 15%, 3점 40%, 4점 30%, 5점 10%
- 총운 별점은 다른 6개 카테고리의 **평균을 반올림**해서 산출 (일관성)

### 4.3 가짜 일진 표시

- 헤더의 "丙午日·병오일"은 **실제 일진이 아니어도 됨**
- 날짜를 60으로 모듈로 연산한 뒤 60갑자 배열에서 인덱싱 (간단한 가짜 계산)
- 진지함을 살리는 장식 요소

---

## 5. 운세 생성 로직 (핵심)

### 5.1 시드 생성

```javascript
function generateSeed(profile, date) {
  const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
  const raw = `${profile.birthYear}-${profile.birthMonth}-${profile.birthDay}-${profile.birthHour ?? 'X'}-${profile.gender}-${dateStr}`;
  return hashString(raw); // 간단한 문자열 해시 → 32bit 정수
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
```

### 5.2 시드 기반 난수 생성기 (Mulberry32 추천)

```javascript
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
```

### 5.3 카테고리별 서브시드

카테고리마다 독립된 난수열을 써서 카테고리 간 상관관계를 끊는다.

```javascript
const categories = ['total', 'class', 'student', 'office', 'work', 'money', 'item', 'quote', 'tip'];

for (const cat of categories) {
  const subSeed = hashString(baseSeed + cat);
  const rng = mulberry32(subSeed);
  const pool = filterPool(fortunePool[cat], profile); // 태그 필터
  const picked = pool[Math.floor(rng() * pool.length)];
  const stars = pickStars(rng);
  // ...
}
```

### 5.4 태그 필터링

운세 풀의 각 항목은 아래 태그를 가진다. 프로필과 매칭되는 항목만 필터링한 뒤 뽑는다.

```json
{
  "text": "쉬는 시간에 복도에서 귀여운 장면을 목격할지도. 오늘은 웃을 일이 많습니다.",
  "school": ["E", "M"],
  "homeroom": "any",
  "subject": "any",
  "gender": "any"
}
```

- `"any"` = 모든 값 매칭
- `["E", "M"]` = 초등·중등만 매칭 (고등 제외)
- `homeroom`: `"any"` | `"homeroom"` (담임만) | `"non-homeroom"` (비담임만) | `[1,2]` (특정 학년)
- `subject`: `"any"` | `["korean", "social"]` 등 키 배열

### 5.5 교과군 키 매핑

| UI 표시 | 키 |
|---|---|
| 국어 | `korean` |
| 수학 | `math` |
| 영어 | `english` |
| 사회 | `social` |
| 과학 | `science` |
| 체육 | `pe` |
| 예술 | `arts` |
| 기술·가정·정보 | `tech` |
| 제2외국어·한문 | `language` |
| 전문교과 | `special` |

---

## 6. 운세 풀 구조

### 6.1 파일 위치

```
/data/fortunes.json
```

### 6.2 규모

카테고리당 **40개** × 9카테고리 = **총 360개 항목**

### 6.3 구조

```json
{
  "total": [
    { "text": "...", "school": "any", "homeroom": "any", "subject": "any" },
    ...40개
  ],
  "class": [ ...40개 ],
  "student": [ ...40개 ],
  "office": [ ...40개 ],
  "work": [ ...40개 ],
  "money": [ ...40개 ],
  "item": [ ...40개 ],
  "quote": [
    {
      "hanja": "勞課以咖, 日日新也",
      "korean": "수업은 커피로, 하루는 새롭게",
      "school": "any", "homeroom": "any", "subject": "any"
    },
    ...40개
  ],
  "tip": [ ...40개 ]
}
```

### 6.4 샘플 문장 (톤 잡기용)

**총운 (total) 샘플 8개** — 모두 긍정 톤
```json
[
  { "text": "오늘은 교무실의 주인공이 될 운. 자연스럽게 행동하세요.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "평온한 하루. 아무 일 없이 지나가는 것도 큰 축복입니다.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "사소한 실수도 귀엽게 넘어가는 너그러운 하루가 됩니다.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "누군가 당신에게 의지하려는 날. 받아주면 운이 더 좋아집니다.", "school": "any", "homeroom": "homeroom", "subject": "any" },
  { "text": "동료의 이야기를 들어주는 자에게 복이 찾아오는 날입니다.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "든든한 점심이 하루의 기운을 두 배로 만들어주는 날.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "오늘의 당신은 평소보다 예리합니다. 학생들도 눈치챕니다.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "별일 없는 것 같지만, 하나쯤은 뿌듯한 순간이 찾아옵니다.", "school": "any", "homeroom": "any", "subject": "any" }
]
```

**수업운 (class) 샘플 8개** — 모두 긍정 톤
```json
[
  { "text": "3교시 판서가 유난히 예쁘게 써지는 날. 사진으로 남겨두세요.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "오늘따라 설명이 술술 풀립니다. 평소 어려워하던 개념도 10분 컷.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "필기구 여분을 챙기면 하루가 든든해지는 날입니다.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "실험 준비가 유난히 수월한 날. 결과도 깔끔하게 나옵니다.", "school": "any", "homeroom": "any", "subject": ["science"] },
  { "text": "서술형 채점이 평소보다 빠르게 끝나는 날. 커피 한 잔의 여유가 있음.", "school": "any", "homeroom": "any", "subject": ["korean", "social", "english"] },
  { "text": "오늘 가르친 개념을 학생이 한 명이라도 제대로 이해했다면 성공.", "school": ["M", "H"], "homeroom": "any", "subject": "any" },
  { "text": "수업 중 나올 질문에 '그건 좋은 질문이네'라고 답할 일이 생깁니다.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "프린터가 제 편을 드는 날. 복사가 막힘없이 잘 됩니다.", "school": "any", "homeroom": "any", "subject": "any" }
]
```

**학생운 (student) 샘플 6개** — 모두 긍정 톤
```json
[
  { "text": "쉬는 시간에 반갑게 달려와 이야기를 건네는 아이를 만나게 됩니다.", "school": ["E", "M"], "homeroom": "any", "subject": "any" },
  { "text": "말 없던 학생이 오늘은 먼저 인사할지도. 놓치지 마세요.", "school": "any", "homeroom": "homeroom", "subject": "any" },
  { "text": "오늘따라 질문이 많은 날. 성장 중인 증거라고 생각하세요.", "school": ["M", "H"], "homeroom": "any", "subject": "any" },
  { "text": "담임 반 아이에게 건네는 따뜻한 한 마디가 오래 기억될 하루입니다.", "school": "any", "homeroom": "homeroom", "subject": "any" },
  { "text": "체육 수업에서 평소보다 환한 미소를 발견하게 됩니다.", "school": "any", "homeroom": "any", "subject": ["pe"] },
  { "text": "오늘 수업에서 눈빛이 살아있는 학생을 발견하게 됩니다.", "school": "any", "homeroom": "any", "subject": "any" }
]
```

**교무실운 (office) 샘플 6개** — 모두 긍정 톤
```json
[
  { "text": "오늘은 누군가 커피를 사줄 가능성. 사양하지 말고 받으세요.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "간식이 교무실에 도착할 확률 높음. 타이밍을 놓치지 말 것.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "동료 교사가 고민 상담을 걸어올 예감. 들어주면 점수 +10.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "프린터 앞에서 누군가와 반가운 말동무가 되는 날.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "점심 메뉴 결정권이 당신에게 옵니다. 맛있는 선택의 기쁨.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "오늘 교무실 분위기는 평소보다 화기애애. 농담 하나 준비해가세요.", "school": "any", "homeroom": "any", "subject": "any" }
]
```

**업무운 (work) 샘플 6개** — 모두 긍정 톤
```json
[
  { "text": "공문 처리 속도 +20%. 밀린 것도 오늘 끝낼 수 있습니다.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "복잡해 보이던 공문이 알고 보니 간단한 일이었던 것으로 밝혀집니다.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "K-에듀파인에 로그인이 한 번에 되는 기적의 날.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "생기부 기록 영감이 떠오르는 시간 — 오후 3시 전후.", "school": ["M", "H"], "homeroom": "homeroom", "subject": "any" },
  { "text": "회의가 의외로 일찍 끝납니다. 기대하세요.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "결재 올린 문서가 한 번에 승인될 확률 높음.", "school": "any", "homeroom": "any", "subject": "any" }
]
```

**금전운 (money) 샘플 5개** — 모두 긍정 톤
```json
[
  { "text": "예상치 못한 소소한 입금 소식. 복지포인트일지도.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "오늘의 작은 절약이 이번 주 가장 큰 만족이 될 예감.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "성과급 시즌이 다가옵니다. 마음의 준비를.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "동료가 커피를 대접하는 날. 지갑이 쉬어갑니다.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "편의점 포인트 적립을 잊지 마세요. 오늘은 티끌이 태산 됩니다.", "school": "any", "homeroom": "any", "subject": "any" }
]
```

**행운템 (item) 샘플 8개** — 모두 긍정 톤
```json
[
  { "text": "빨간 볼펜 — 책상 가장 가까이 두세요.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "포스트잇 — 오늘은 메모가 당신을 빛나게 합니다.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "네임펜 — 이름을 써야 할 좋은 일이 생깁니다.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "머그컵 — 따뜻한 음료가 오늘의 수호신.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "자석 — 오늘의 칠판은 자석의 도움으로 빛납니다.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "목캔디 — 세 교시 연속 수업의 든든한 친구.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "손세정제 — 오늘은 산뜻함을 선사해주는 수호템.", "school": ["E"], "homeroom": "any", "subject": "any" },
  { "text": "호루라기 — 오늘의 체육 수업이 활기차게 흘러갑니다.", "school": "any", "homeroom": "any", "subject": ["pe"] }
]
```

**오늘의 한 줄 (quote) 샘플 6개** — 가짜 고사성어
```json
[
  { "hanja": "勞課以咖, 日日新也", "korean": "수업은 커피로, 하루는 새롭게", "school": "any", "homeroom": "any", "subject": "any" },
  { "hanja": "師者多忙, 忙中有閑", "korean": "교사는 바쁘나, 바쁨 속에 여유가 있느니라", "school": "any", "homeroom": "any", "subject": "any" },
  { "hanja": "板書如畵, 學生如鏡", "korean": "판서는 그림과 같고, 학생은 거울과 같다", "school": "any", "homeroom": "any", "subject": "any" },
  { "hanja": "公文速決, 退勤早至", "korean": "공문을 빨리 결재하면, 퇴근이 일찍 온다", "school": "any", "homeroom": "any", "subject": "any" },
  { "hanja": "一問一答, 千金不換", "korean": "한 번의 질문과 답은 천금과도 바꿀 수 없다", "school": "any", "homeroom": "any", "subject": "any" },
  { "hanja": "午睡十分, 五校時活", "korean": "점심 후 10분 낮잠이면 5교시가 살아난다", "school": "any", "homeroom": "any", "subject": "any" }
]
```

**꿀팁 (tip) 샘플 6개** — 모두 긍정 톤
```json
[
  { "text": "3교시 시작 전에 물 한 잔. 목이 먼저 살아야 수업도 산다.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "오늘은 퇴근 전 5분을 비워두세요. 마무리의 여유가 하루를 완성합니다.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "첫 교시 수업 전에 창문을 한 번 열어두면 하루가 달라집니다.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "회의 자료는 미리 한 번 훑어보세요. 오늘은 보람이 있습니다.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "점심 후 교무실 자리에 앉기 전에 한 바퀴만 걷고 오세요.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "아이들 이름을 평소보다 한 번 더 불러보세요. 반응이 다릅니다.", "school": "any", "homeroom": "homeroom", "subject": "any" }
]
```

### 6.5 고등학교 전용 샘플 — 최소성취수준보장지도(최성보) 관련

고교학점제 전면 시행에 따라 고등학교 교사들의 일상에 자리 잡은 "최소성취수준보장지도"를 반영한다. 고등학교 태그(`school: ["H"]`)로만 노출되며, 긍정 톤을 유지하되 교사의 실제 업무 맥락을 정확히 포착하는 게 핵심.

**수업운 (class) — 최성보 관련 6개**
```json
[
  { "text": "최성보 보충 수업이 예상보다 매끄럽게 흘러가는 날. 아이들 눈빛이 달라집니다.", "school": ["H"], "homeroom": "any", "subject": "any" },
  { "text": "최성보 보충 자료가 한 번에 완성되는 기적의 날.", "school": ["H"], "homeroom": "any", "subject": "any" },
  { "text": "미도달 예상 학생이 오늘따라 유난히 집중하는 모습을 보입니다.", "school": ["H"], "homeroom": "any", "subject": "any" },
  { "text": "최성보 대상 학생이 '선생님 이건 알 것 같아요'라고 말해주는 하루.", "school": ["H"], "homeroom": "any", "subject": "any" },
  { "text": "짧게 준비한 보충 설명이 의외로 큰 울림을 주는 날.", "school": ["H"], "homeroom": "any", "subject": "any" },
  { "text": "평가계획 기반 최성보 수업 흐름이 한눈에 정리되는 하루.", "school": ["H"], "homeroom": "any", "subject": "any" }
]
```

**학생운 (student) — 최성보 관련 5개**
```json
[
  { "text": "최성보를 받던 학생이 조용히 고맙다고 전해올지도 모릅니다.", "school": ["H"], "homeroom": "any", "subject": "any" },
  { "text": "포기할 것 같던 학생이 오늘은 한 문제 더 풀어보려 합니다.", "school": "any", "homeroom": "any", "subject": "any" },
  { "text": "최성보 대상 학생과의 라포가 한 단계 깊어지는 날.", "school": ["H"], "homeroom": "any", "subject": "any" },
  { "text": "평소 조용하던 학생이 먼저 질문을 들고 찾아오는 하루.", "school": ["H"], "homeroom": "any", "subject": "any" },
  { "text": "최성보 수업이 끝난 뒤 남아 질문하는 학생을 만나게 됩니다.", "school": ["H"], "homeroom": "any", "subject": "any" }
]
```

**업무운 (work) — 최성보 관련 4개**
```json
[
  { "text": "최성보 계획서 작성이 예상보다 수월하게 풀리는 날.", "school": ["H"], "homeroom": "any", "subject": "any" },
  { "text": "최성보 관련 기록이 한 번에 정리되는 산뜻한 하루.", "school": ["H"], "homeroom": "any", "subject": "any" },
  { "text": "미도달 학생 명단이 생각보다 짧아서 한숨 돌리는 날.", "school": ["H"], "homeroom": "any", "subject": "any" },
  { "text": "최성보 운영 관련 공문이 유난히 이해하기 쉬운 날.", "school": ["H"], "homeroom": "any", "subject": "any" }
]
```

**꿀팁 (tip) — 최성보 관련 4개**
```json
[
  { "text": "최성보는 꾸준함이 열쇠. 오늘 10분이면 충분합니다.", "school": ["H"], "homeroom": "any", "subject": "any" },
  { "text": "미도달 학생에게는 '할 수 있어'보다 '이것 하나만 해보자'가 더 잘 통합니다.", "school": ["H"], "homeroom": "any", "subject": "any" },
  { "text": "최성보 수업 전에 가장 쉬운 문제부터 준비하세요. 첫 성공 경험이 중요합니다.", "school": ["H"], "homeroom": "any", "subject": "any" },
  { "text": "최성보 기록은 그날 바로 남겨두세요. 미루면 두 배로 무거워집니다.", "school": ["H"], "homeroom": "any", "subject": "any" }
]
```

**오늘의 한 줄 (quote) — 최성보 관련 2개**
```json
[
  { "hanja": "一步一進, 必有成就", "korean": "한 걸음씩 나아가면 반드시 성취가 있느니라", "school": ["H"], "homeroom": "any", "subject": "any" },
  { "hanja": "最低保障, 最高關心", "korean": "최소성취를 보장함은 최고의 관심에서 비롯된다", "school": ["H"], "homeroom": "any", "subject": "any" }
]
```

### 6.6 초등학교 전용 샘플

초등 교사의 일상 — 학부모 알림장, 방과후·돌봄, 받아쓰기, 일기장, 학예회·운동회, 생존수영, 배식 지도, 1인 1역 등을 반영한다. 아이들의 애정 표현이 잦고, 학부모 소통 빈도가 높은 특성을 긍정적으로 담아낸다. 태그는 `school: ["E"]`.

**수업운 (class) — 초등 관련 5개**
```json
[
  { "text": "받아쓰기가 유난히 매끄럽게 진행되는 날. 아이들도 신나 보입니다.", "school": ["E"], "homeroom": "any", "subject": "any" },
  { "text": "복잡한 개념도 쉬운 비유 하나로 단번에 이해되는 하루.", "school": ["E"], "homeroom": "any", "subject": "any" },
  { "text": "교실 뒷정리가 아이들 손으로 깔끔히 끝나는 산뜻한 날.", "school": ["E"], "homeroom": "any", "subject": "any" },
  { "text": "일기장 댓글 쓰는 시간이 유난히 즐거운 하루.", "school": ["E"], "homeroom": "any", "subject": "any" },
  { "text": "생존수영 인솔이 예상보다 수월하게 흘러가는 날.", "school": ["E"], "homeroom": "any", "subject": "any" }
]
```

**학생운 (student) — 초등 관련 5개**
```json
[
  { "text": "'선생님 사랑해요' 편지를 받게 될지도 모르는 하루.", "school": ["E"], "homeroom": "any", "subject": "any" },
  { "text": "쉬는 시간에 아이가 그린 그림을 선물로 받게 되는 날.", "school": ["E"], "homeroom": "any", "subject": "any" },
  { "text": "평소 말 없던 아이가 먼저 다가와 수다를 떠는 하루.", "school": ["E"], "homeroom": "any", "subject": "any" },
  { "text": "배식 시간이 평소보다 질서정연하게 흘러가는 날.", "school": ["E"], "homeroom": "any", "subject": "any" },
  { "text": "1인 1역을 책임감 있게 해내는 아이를 발견하는 하루.", "school": ["E"], "homeroom": "any", "subject": "any" }
]
```

**업무운 (work) — 초등 관련 4개**
```json
[
  { "text": "학부모 알림장이 술술 써지는 날. 아이 칭찬거리가 유난히 많습니다.", "school": ["E"], "homeroom": "homeroom", "subject": "any" },
  { "text": "방과후 수업 준비가 예상보다 일찍 끝나는 가벼운 하루.", "school": ["E"], "homeroom": "any", "subject": "any" },
  { "text": "돌봄교실 전달사항이 한 번에 깔끔히 정리되는 날.", "school": ["E"], "homeroom": "any", "subject": "any" },
  { "text": "학예회·운동회 계획서가 한 번에 매듭지어지는 하루.", "school": ["E"], "homeroom": "any", "subject": "any" }
]
```

**꿀팁 (tip) — 초등 관련 4개**
```json
[
  { "text": "오늘은 아이들 이름을 한 명씩 불러주며 한 마디씩 건네보세요.", "school": ["E"], "homeroom": "any", "subject": "any" },
  { "text": "일기장 댓글은 한 줄이면 충분합니다. 읽었다는 신호가 가장 중요해요.", "school": ["E"], "homeroom": "homeroom", "subject": "any" },
  { "text": "학부모 상담 전에는 커피 한 잔의 여유를 꼭 챙기세요.", "school": ["E"], "homeroom": "homeroom", "subject": "any" },
  { "text": "쉬는 시간에 아이들 눈높이에 앉아서 대화해보세요. 다른 세상이 보입니다.", "school": ["E"], "homeroom": "any", "subject": "any" }
]
```

**오늘의 한 줄 (quote) — 초등 관련 2개**
```json
[
  { "hanja": "愛兒一言, 千金之重", "korean": "아이에게 건네는 한 마디는 천금의 무게가 있다", "school": ["E"], "homeroom": "any", "subject": "any" },
  { "hanja": "小步日進, 大成自來", "korean": "작은 걸음이 매일 쌓이면 큰 성장은 저절로 찾아온다", "school": ["E"], "homeroom": "any", "subject": "any" }
]
```

### 6.7 중학교 전용 샘플

중등 교사의 일상 — 자유학기·자유학년제, 진로교육, 동아리 활동, 수행평가, 중간·기말고사, 학생자치, 생기부(과세특·행특), 사춘기 대응 등을 반영한다. 태그는 `school: ["M"]`.

**수업운 (class) — 중등 관련 5개**
```json
[
  { "text": "자유학기 프로젝트 수업이 예상보다 활기차게 흘러가는 날.", "school": ["M"], "homeroom": "any", "subject": "any" },
  { "text": "수행평가 채점이 예상보다 빨리 끝나는 하루.", "school": ["M"], "homeroom": "any", "subject": "any" },
  { "text": "진로 수업에서 아이들이 눈빛을 반짝이는 순간을 만나게 됩니다.", "school": ["M"], "homeroom": "any", "subject": "any" },
  { "text": "시험 출제 문항이 한 번에 정리되는 기분 좋은 날.", "school": ["M"], "homeroom": "any", "subject": "any" },
  { "text": "동아리 활동 시간이 유난히 활기차게 끝나는 하루.", "school": ["M"], "homeroom": "any", "subject": "any" }
]
```

**학생운 (student) — 중등 관련 5개**
```json
[
  { "text": "사춘기의 무뚝뚝함 속에서 따뜻한 순간을 발견하게 되는 하루.", "school": ["M"], "homeroom": "any", "subject": "any" },
  { "text": "학급 회의가 유난히 활기차게 진행되는 날.", "school": ["M"], "homeroom": "homeroom", "subject": "any" },
  { "text": "동아리 활동에서 아이들의 새로운 모습을 발견하는 하루.", "school": ["M"], "homeroom": "any", "subject": "any" },
  { "text": "조용하던 학생이 오늘은 자기 생각을 또렷이 말해주는 날.", "school": ["M"], "homeroom": "any", "subject": "any" },
  { "text": "수련회·체험학습 준비가 기대감으로 한층 들뜨는 하루.", "school": ["M"], "homeroom": "any", "subject": "any" }
]
```

**업무운 (work) — 중등 관련 4개**
```json
[
  { "text": "생기부 과세특 문장이 술술 써지는 하루.", "school": ["M"], "homeroom": "any", "subject": "any" },
  { "text": "동아리 기록이 한 번에 정리되는 산뜻한 날.", "school": ["M"], "homeroom": "any", "subject": "any" },
  { "text": "자유학기 운영 보고서가 수월하게 마무리되는 하루.", "school": ["M"], "homeroom": "any", "subject": "any" },
  { "text": "수행평가 기록이 한 번에 입력되는 가벼운 오후.", "school": ["M"], "homeroom": "any", "subject": "any" }
]
```

**꿀팁 (tip) — 중등 관련 4개**
```json
[
  { "text": "수행평가 루브릭은 수업 첫날에 공개하세요. 나중의 수고가 줄어듭니다.", "school": ["M"], "homeroom": "any", "subject": "any" },
  { "text": "사춘기 아이에게는 '왜?'보다 '어떻게?'가 더 잘 통합니다.", "school": ["M"], "homeroom": "any", "subject": "any" },
  { "text": "과세특 기록은 학생 발표 직후가 가장 생생합니다. 바로 메모해두세요.", "school": ["M"], "homeroom": "any", "subject": "any" },
  { "text": "진로 수업은 '정답'보다 '질문'이 많은 시간일수록 성공입니다.", "school": ["M"], "homeroom": "any", "subject": "any" }
]
```

**오늘의 한 줄 (quote) — 중등 관련 2개**
```json
[
  { "hanja": "探進路者, 見未來影", "korean": "진로를 탐색하는 자, 미래의 그림자를 본다", "school": ["M"], "homeroom": "any", "subject": "any" },
  { "hanja": "問一得十, 自由學期", "korean": "한 번 물으면 열을 얻으니, 자유학기의 이치로다", "school": ["M"], "homeroom": "any", "subject": "any" }
]
```

---

**→ Claude Code가 할 일**: 위 샘플의 톤·분량을 유지하면서 각 카테고리를 40개까지 확장. 태그 분포 목표:

| 태그 | 비율 |
|---|---|
| `school: "any"` (전체 공통) | 50% |
| 교과군·담임 등 기타 타깃 | 20% |
| 고등 전용 (최성보 포함) | 10% |
| 초등 전용 | 10% |
| 중등 전용 | 10% |

학교급별 전용 문장은 수업운·학생운·업무운·꿀팁에 고르게 배치한다. 총운·교무실운·금전운·행운템은 대체로 `"any"`로 유지해서 학교급과 무관한 공통 감성을 담는다.

**문장 작성 원칙 (반드시 준수)**:
1. **모든 문장은 긍정·중립 톤**. "주의", "조심", "~할 확률이 있으니 대비하세요" 같은 경고 표현 금지.
2. 별점이 낮게 뽑히는 경우에도 부정이 아니라 **부드러운 긍정**으로 작성한다. 예시 전환:
   - ❌ "오늘 수업 집중도 낮음. 주의 필요." → ✅ "평온한 수업이 흘러가는 조용한 하루."
   - ❌ "민원 주의." → ✅ "담담히 하루를 보내기에 좋은 날."
3. 별점은 행운의 **강도 차이**일 뿐, 저점이 '나쁨'이 아니다. 1점도 "평온한 날"로 표현 가능.
4. 한국 학교 일과를 정확히 반영한다 — **4교시 후 점심**, 보통 6~7교시까지, 야자는 고등만, 쉬는 시간 10분 등.
5. 교사 공감 포인트에 기반한다 — 판서, 채점, 공문, K-에듀파인, 생기부, 복지포인트, 성과급, 교무실 간식, 학부모 상담, 수행평가 등.
6. **학교급별 맥락 반영 (중요)**:
   - **고등 (`school: ["H"]`)**: 고교학점제 현실 — 최소성취수준보장지도(**최성보**), 선택과목, 공강 시간, 이수/미이수, 학업성취도평가, 수능·정시·수시 등
   - **초등 (`school: ["E"]`)**: 학부모 알림장, 방과후·돌봄교실, 받아쓰기, 일기장, 학예회·운동회, 생존수영, 배식 지도, 1인 1역, 아이들의 애정 표현 등
   - **중등 (`school: ["M"]`)**: 자유학기(자유학년)제, 진로교육, 동아리 활동, 수행평가, 학생자치회, 생기부(과세특·행특), 사춘기 대응 등
   - 전문용어 나열이 아니라 **교사의 일상 감정과 맞닿은 표현**으로 녹여 쓸 것.

---

## 7. 공유 기능

### 7.1 이미지 저장

라이브러리: **html2canvas** (CDN으로 로드 가능)

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
```

```javascript
async function saveAsImage() {
  const element = document.getElementById('fortune-result');
  const canvas = await html2canvas(element, {
    backgroundColor: '#ffffff',
    scale: 2  // 고해상도
  });
  const link = document.createElement('a');
  link.download = `오늘의_교사운세_${todayStr()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
```

### 7.2 공유하기

환경 자동 감지 + 폴백.

```javascript
async function share() {
  const url = 'https://mealnstroll.bgnl.kr'; // 실제 URL로 교체
  const shareText = '오늘의 교사 운세 확인하기';

  // 모바일 + Web Share API 지원 → OS 공유 시트
  if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
    try {
      // 이미지까지 함께 공유 (지원 기기만)
      const canvas = await html2canvas(document.getElementById('fortune-result'), { scale: 2 });
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const file = new File([blob], 'fortune.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: '오늘의 교사 운세',
          text: shareText,
          url: url,
          files: [file]
        });
        return;
      }
      // 파일 공유 미지원 → URL만
      await navigator.share({ title: '오늘의 교사 운세', text: shareText, url });
      return;
    } catch (e) {
      // 사용자 취소 또는 실패 → 폴백
    }
  }

  // 데스크톱 또는 Share API 미지원 → 클립보드 복사
  await navigator.clipboard.writeText(url);
  showToast('링크가 복사되었어요!');
}
```

### 7.3 버튼 배치

결과 모달 하단 버튼 영역에:
- `📸 이미지 저장` (주 액션, primary 색)
- `🔗 공유하기` (보조 액션, secondary)
- `정보 수정` (텍스트 링크 스타일, 작게)
- `닫기` (X 아이콘, 우상단)

---

## 8. 파일 구조

기존 meal n stroll 구조에 **추가되는 파일만** 표시:

```
meal-n-stroll/
├── index.html                    (수정: 모달 HTML + 버튼 추가)
├── css/
│   └── fortune.css               (신규)
├── js/
│   ├── fortune.js                (신규: 모달 제어 + 운세 생성 로직)
│   └── fortune-data.js or        (신규: 운세 풀 로드)
│       data/fortunes.json
└── lib/
    └── html2canvas.min.js        (CDN 사용 시 불필요)
```

React 프로젝트일 경우:

```
src/
├── components/
│   ├── FortuneButton.jsx         (메인 화면에 추가)
│   ├── FortuneModal.jsx          (모달 컨테이너)
│   ├── FortuneInputForm.jsx      (입력 폼)
│   └── FortuneResult.jsx         (결과 화면)
├── data/
│   └── fortunes.json
└── utils/
    └── fortune.js                (시드·난수·태그 필터 로직)
```

---

## 9. 디자인 가이드

### 9.1 톤

- meal n stroll의 기존 디자인 톤을 **70% 계승**
- 운세 특유의 "살짝 예스러운 느낌"을 **30% 추가**
  - 헤더에 가짜 일진(한자 + 한글)
  - `quote` 카테고리의 한자 표시
  - 폰트 강조: 한자는 serif 계열 (예: Noto Serif KR)

### 9.2 색상 제안

meal n stroll 색상을 유지하되, 운세 모달 내부 포인트 컬러로:
- **먹색** `#2B2B2B` — 헤더 배경 또는 테두리
- **주홍 (인주)** `#C0392B` — 별점, 도장 느낌 포인트
- 나머지는 meal n stroll 팔레트 그대로

### 9.3 애니메이션

- 모달 오픈: fade + slight zoom (0.2초)
- 결과 화면 카테고리 항목: 위에서부터 순차적으로 stagger fade-in (각 0.08초 간격)
- 별점: 채워지는 애니메이션 (왼쪽부터 하나씩)

---

## 10. 구현 단계 (Claude Code 작업 순서)

### Phase 1: 기반 구조
1. 기존 meal n stroll 코드 스캔 → 프레임워크(바닐라 vs React) 파악
2. 메인 화면에 `🔮 오늘의 교사 운세` 버튼 추가
3. 빈 모달 컴포넌트/HTML 생성 + 열기/닫기 동작

### Phase 2: 입력 폼
4. 입력 폼 UI 구현 (학교급 따라 담임 드롭다운 동적 변경)
5. 유효성 검증 로직
6. localStorage 저장/로드 로직

### Phase 3: 운세 엔진
7. 시드 생성 + Mulberry32 난수 생성기 구현
8. `fortunes.json` 파일 생성 (샘플 문장 + 각 카테고리당 40개로 확장)
9. 태그 필터링 + 카테고리별 뽑기 로직
10. 별점 생성 + 총운 별점 자동 계산

### Phase 4: 결과 화면
11. 결과 모달 UI 구현 (9개 카테고리 렌더링)
12. 가짜 일진 계산 및 헤더 표시
13. stagger fade-in 애니메이션

### Phase 5: 공유
14. html2canvas 로드
15. 이미지 저장 기능
16. Web Share API + 폴백 구현
17. 토스트 알림

### Phase 6: 폴리싱
18. 재방문 자동 로드 플로우 테스트
19. "정보 수정" → 입력 폼 재진입 테스트
20. 모바일·데스크톱 레이아웃 점검
21. 이미지 저장·공유 실기기 테스트

---

## 11. 기술적 주의사항

- **날짜 기준**: `new Date()` 그대로 쓰면 브라우저 로컬 타임존. 한국 사용자 기준이므로 KST 고정하지 않아도 OK.
- **localStorage 키 네이밍**: `teacherFortune_profile` (meal n stroll의 다른 localStorage와 충돌 방지용 prefix)
- **모달 접근성**: ESC 키로 닫기, 모달 밖 클릭 시 닫기, `aria-modal="true"`
- **html2canvas 성능**: 모달 크기가 크면 렌더링 2~3초 걸릴 수 있음 → 버튼 클릭 시 로딩 표시
- **iOS Safari의 `navigator.share` 파일 지원**: 14.3 이상만. `navigator.canShare` 체크 필수
- **한자 폰트 폴백**: 구형 안드로이드에서 한자가 네모로 뜰 수 있음 → Noto Serif KR 웹폰트 또는 기본 한자 폰트 체인 지정

---

## 12. 향후 확장 여지 (이번 MVP 범위 밖)

- 어제의 운세 "적중도" 평가 기능
- 월간 운세 달력 뷰
- "친구에게 운세 선물하기" (생년월일 입력 후 URL 생성)
- 퇴근 게이지 / 방학 디데이 / 월급 디데이와의 통합 대시보드화
- 입력 정보를 meal n stroll 메뉴 추천·산책 추천에도 연동

---

**작성일**: 2026년 4월 21일
**대상 리포지토리**: meal n stroll (bgnl.kr)
**작성자**: Claude (용현이와 기획 세션 후)
