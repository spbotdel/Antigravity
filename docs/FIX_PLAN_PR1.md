# FIX PLAN PR1

## Summary

Оставлены только high-confidence проблемы из review.
Стиль, форматирование, непроверенные гипотезы и мелкие UI-наблюдения исключены.

Батчи сгруппированы так, чтобы их можно было чинить и мерджить отдельно, даже если контекст между шагами сбросится.

Публичные API менять не требуется; это behavioral/test hardening и один shared-UI текстовый fix.

## Batch 1 — Upload Transport Correctness

### Issues included
- `lib/utils.ts` сейчас переводит direct upload в server proxy на любой XHR failure.
- Это смешивает transient network/storage failures с non-retryable случаями:
  - user abort
  - 4xx / permission / config errors
  - invalid signed URL responses
- `tests/upload-transport-contract.test.ts` покрывает только happy path и сценарий `any error -> proxy`, но не фиксирует обратный контракт: когда proxy fallback делать нельзя.

### Why grouped together
Это один и тот же пользовательский баг-класс в одном модуле: неверная retry/fallback policy для browser-side upload transport.

### Implementation order
1. Делать первым.
2. Сначала зафиксировать ожидаемое поведение тестами:
   - network/timeout-style failures могут идти в proxy
   - user abort и 4xx должны возвращаться как ошибки без proxy retry
3. Потом сузить fallback condition в `uploadFileWithTransportContract`.
4. Убедиться, что variant flow не ломается в:
   - direct-success
   - full-proxy scenarios

### Risk if not fixed
- Скрываются реальные причины сбоев.
- Direct upload может неожиданно “лечиться” proxy-ретраем там, где нужно показать ошибку пользователю.
- Это даёт ложную успешность, лишний трафик, дублирующую загрузку и затрудняет отладку storage/auth проблем.

## Batch 2 — Signed URL Fallback Hardening

### Issues included
- Платформенно-специфичный fallback `native fetch -> PowerShell` в `lib/server/repository.ts` не зафиксирован достаточными тестами, особенно для `win32` path и сценариев, где PowerShell недоступен или сам падает.
- `tests/repository-signed-http.test.ts` не закрепляет весь контракт вокруг:
  - timeout/network-only fallback
  - деградации до repository-level 503

### Why grouped together
Это один transport boundary вокруг:
- `runNativeSignedHttpRequest`
- `runSignedHttpRequest`

Здесь важнее всего не рефакторинг, а чёткая фиксация контракта и platform-specific regression coverage.

### Implementation order
1. Делать вторым, после Batch 1.
2. Сначала добавить тесты на:
   - `win32` fallback path
   - native timeout/network failure
   - PowerShell failure/unavailable
   - expected 503 mapping
3. Если тесты проявят неявные расхождения, только тогда минимально править transport logic, не меняя внешний API.

### Risk if not fixed
- Windows-only path останется хрупким и может тихо регресснуть.
- При проблемах object storage будут появляться труднообъяснимые 503 без уверенности, что fallback реально работает так, как задуман.

## Batch 3 — Shared Dialog Localization / Accessibility

### Issues included
- В `components/ui/dialog.tsx` захардкожены английские `Close`:
  - в `sr-only`
  - во visible footer action
- Поскольку это shared primitive, текст размножается по нескольким русскоязычным диалогам сразу.

### Why grouped together
Это один isolated fix в shared UI primitive без зависимости от upload logic.

### Implementation order
1. Делать последним.
2. Локализовать оба варианта close-label в primitive.
3. Быстро прогнать затронутые component tests / RTL queries, если они завязаны на текст.

### Risk if not fixed
- Останется user-facing language mismatch в русскоязычном интерфейсе.
- Accessibility output для screen readers будет менее аккуратным.

## Assumptions

- В план включены только подтверждённые или высоковероятные проблемы из review.
- `SelectField` synthetic event, semicolon/style, padding/layout и response-drain замечания считаются либо низкоприоритетными, либо недостаточно доказанными для этого fix plan.
- Batch 1 и Batch 2 должны сопровождаться тестами в том же шаге, чтобы после reset контекста не потерялся intended contract.
