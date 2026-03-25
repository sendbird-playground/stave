# Stave Auto Orchestration System

> **상태: 구현 완료 (Phase 1–4, 2026-03-25)**
> 운영 문서는 [`docs/features/stave-model-router.md`](../features/stave-model-router.md) 참고.

## 개요

"Stave Auto" 선택 시 동작하는 지능형 멀티모델 오케스트레이션 시스템.
사용자의 요청 복잡도를 LLM이 의미론적으로 판단해 단일 모델 처리와 다중 모델 협업을 자동 선택한다.

---

## 전체 흐름

```
사용자가 "Stave Auto" 선택 후 프롬프트 전송
           ↓
   ┌─────────────────────────────────────┐
   │         Pre-processor               │
   │  기본: claude-haiku-4-5             │
   │  대체: gpt-5.3-codex (haiku 불가)   │
   │  최후: regex fallback (둘 다 불가)   │
   └─────────────────────────────────────┘
           ↓ ExecutionPlan
    ┌───────┴────────┐
 direct          orchestrate
    ↓                  ↓
[단일 모델]      ┌─────────────────────────┐
 직접 처리       │       Supervisor         │
                │  기본: claude-opus-4-6   │
                │  대체: gpt-5.4 (불가시)  │
                └─────────┬───────────────┘
                          ↓
              [Worker A] [Worker B] [Worker C]
               (어떤 모델이든 배정 가능)
                          ↓
                    [합성 → 최종 응답]
```

---

## 컴포넌트

### 1. Pre-processor (`stave-preprocessor.ts`)

- **역할**: 프롬프트 의도 파악 + 실행 전략 결정
- **모델 우선순위**:
  1. `claude-haiku-4-5` (기본 — 빠르고 저렴)
  2. `gpt-5.3-codex` (haiku 불가 시)
  3. `resolveStaveTarget()` regex (둘 다 불가 시)
- **출력**: `ExecutionPlan`

```typescript
type ExecutionPlan =
  | {
      strategy: "direct";
      model: string;
      reason: string;
      executionHints?: { fastMode?: boolean };
    }
  | {
      strategy: "orchestrate";
      supervisorModel: string;
      reason: string;
    };
```

### 2. Availability Cache (`stave-availability.ts`)

- **역할**: provider 가용성 TTL 캐시 (30초)
- Pre-processor 모델 선택 및 라우팅 결정 시 참조

### 3. Direct Router (기존 `stave-router.ts` 재사용)

- Pre-processor가 `strategy: "direct"` 반환 시 활성화
- Pre-processor가 LLM 기반이면: Pre-processor의 모델 선택 사용
- Pre-processor가 regex fallback이면: `resolveStaveTarget()` 사용
- 선택된 모델 불가 시 자동 대체 모델 교체

### 4. Orchestrator (`stave-orchestrator.ts`) — Phase 3

- Pre-processor가 `strategy: "orchestrate"` 반환 시 활성화
- Supervisor 모델: 설정에서 지정 (기본 `claude-opus-4-6`, `gpt-5.4` 가능)
- Claude Agent SDK의 native `agents` 기능 활용 (Claude workers)
- Codex는 MCP bridge tool로 노출 (cross-vendor 협업)

---

## Direct 경로 모델 팔레트

| 상황 | 모델 | fastMode |
|---|---|---|
| 빠른 수정 (오타, 변수명 등) | `claude-haiku-4-5` | — |
| 일반 코딩 / 설명 | `claude-sonnet-4-6` | — |
| 코드 생성 특화 | `gpt-5.3-codex` | — |
| 복잡 + 정확도 중요 | `claude-opus-4-6` | false |
| **복잡 + 빠르게** | **`gpt-5.4`** | **true** |
| OpenAI 생태계 | `gpt-5.4` | — |
| 계획/설계만 (코드 수정 없음) | `opusplan` | — |

---

## 설정 추가 (`ProviderRuntimeOptions`)

```typescript
stavePreprocessorModel?: string;     // 기본: "claude-haiku-4-5"
staveSupervisorModel?: string;       // 기본: "claude-opus-4-6"
staveOrchestrationEnabled?: boolean; // 기본: true (Stave Auto 선택 시)
```

---

## BridgeEvent 확장

Provider 네이티브 이벤트는 그대로 유지하고, Stave 전용 메타 이벤트는 `stave:` 접두사로 명확히 구분한다.

```typescript
// Stave 메타 이벤트 (Stave 로직이 생성)
| { type: "stave:execution_plan"; strategy: "direct" | "orchestrate"; model?: string; supervisorModel?: string; reason: string; fastMode?: boolean }
| { type: "stave:orchestration_started"; supervisorModel: string }
| { type: "stave:subtask_started"; subtaskId: string; model: string; title: string }
| { type: "stave:subtask_done"; subtaskId: string; success: boolean }
| { type: "stave:synthesis_started" }
```

---

## 신규/수정 파일

### 신규

| 파일 | 역할 |
|---|---|
| `electron/providers/stave-availability.ts` | Provider 가용성 TTL 캐시 |
| `electron/providers/stave-preprocessor.ts` | Pre-processor 엔진 (LLM + regex fallback) |
| `electron/providers/stave-orchestrator.ts` | Supervisor + Worker 관리 (Phase 3) |

### 수정

| 파일 | 변경 내용 |
|---|---|
| `electron/providers/runtime.ts` | stave 분기 → Pre-processor 흐름으로 재구성 |
| `electron/providers/types.ts` | `stave:*` BridgeEvent 타입 추가 |
| `src/lib/providers/provider.types.ts` | 설정 필드 + `stave:*` NormalizedProviderEvent 추가 |
| `src/lib/session/provider-event-replay.ts` | `stave:*` 이벤트 처리 |
| `src/components/session/ChatPanel.tsx` | Orchestration UI (Phase 4) |

---

## 구현 로드맵

> **전체 완료 (2026-03-25)**

### Phase 1 — 기반 인프라 ✅
- Availability Cache (`stave-availability.ts`)
- Pre-processor (haiku LLM + regex fallback) (`stave-preprocessor.ts`)
- `stave:execution_plan` 이벤트 흐름
- `runtime.ts` stave 분기 재구성

### Phase 2 — 가용성 인식 라우팅 ✅
- Direct Router에 availability fallback 추가 (`runtime.ts`)
- 선택된 모델 불가 시 자동 대체 (5개 모델 쌍 정의)

### Phase 3 — Orchestrator ✅
- Supervisor + Worker 관리 (`stave-orchestrator.ts`)
- `dependsOn` 위상 정렬 → 독립 태스크 `Promise.all` 병렬 실행
- `{subtask-id}` 플레이스홀더로 이전 결과 주입
- `stave:orchestration_plan`, `stave:subtask_started/done`, `stave:synthesis_started` 이벤트 추가

### Phase 4 — UI + 설정 ✅
- `OrchestrationCard` 컴포넌트 (`src/components/ai-elements/orchestration.tsx`)
- `orchestration_progress` MessagePart 타입 추가 (`src/types/chat.ts`)
- `ChatPanel.tsx`에 `case "orchestration_progress"` 처리 추가
- Settings에 `StaveOrchestrationCard` 추가 (Pre-processor 모델 / Supervisor 모델 / 활성화 토글)
- `app.store.ts`에 설정 3개 + `runtimeOptions` 매핑 추가

---

## 핵심 설계 원칙

1. **Stave Auto 전용** — `providerId === "stave"` 일 때만 동작
2. **Pre-processor는 가볍게** — 단순한 JSON 결정, 단일 턴, 10초 타임아웃
3. **Stave 메타 이벤트는 `stave:` 접두사** — Provider 네이티브 이벤트와 타입 레벨 분리
4. **Regex fallback 유지** — LLM Pre-processor 불가 시 현재 동작 보장
5. **Provider 중립** — Pre-processor/Supervisor 모두 설정으로 교체 가능
