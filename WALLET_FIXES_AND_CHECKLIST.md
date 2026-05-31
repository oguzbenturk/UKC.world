# Plannivo Cüzdan Sistemi — Düzeltme Özeti + Manuel Kontrol Listesi

Tarih: 2026-05-31 · Tüm değişiklikler **local main working tree**'de (commit edilmedi).
Test: **75/75 backend wallet testi geçti** + frontend formatter düz `node` ile doğrulandı.
(Yalnızca 2 suite `sharp` native-modül ortam sorunundan yüklenemiyor — kodla alakasız.)

---

## Yapıldı (özet)

**Wave 1 — Çekirdek** (`walletService.js`, migration 265): Decimal.js para matematiği + NaN'da throw · `recordTransaction` idempotency (key + UNIQUE index) · overdraft floor · `set_config` transaction-local (bağlantı sızıntısı yok) · guard trigger INSERT + pending/non_withdrawable · ledger↔cache reconciliation helper'ları · deposit reference_code UNIQUE.

**Wave 2 — Kritik**: webhook imza doğrulama (PayTR/Binance/Iyzico) · `/wallet/deposit` autoComplete rol kapısı (bedava self-topup kapandı) · Kai `agent.js` ham SQL → `recordTransaction` · Iyzico callback'lerde idempotency + atomik guard.

**Wave 3a — İade simetrisi**: `getEntityNetCharges` (orijinal currency + outstanding-only) → rentals/bookings/shopOrders/studentPortal iadeleri · hybrid öksüz-borç reversal · studentPortal çift-kredi silindi.

**Wave 3b — Tutarlılık**: services.js paket-satın-alma `FOR UPDATE` · users.js silme öncesi cüzdan arşivi (migration 266) · finances.js çok-currency EUR normalizasyonu (gelir + outstanding).

**Wave 4 — Frontend**: `formatCurrency` kuruşları koruyor (decimal_places) · `UserBalances.jsx` crash + response-shape fix.

**Wave 5 — SSOT guard**: reconciliation servisine wallet ledger↔cache drift alarmı (`[WALLET-DRIFT]`, periyodik, salt-okunur).

---

# 📋 MANUEL KONTROL LİSTESİ (senin yapman gerekenler)

## A. Korumaları aktive et (env)
1. **Webhook secret'larını ekle:** `IYZICO_WEBHOOK_SECRET`, `PAYTR_MERCHANT_KEY` + `PAYTR_MERCHANT_SALT`, `BINANCE_PAY_SECRET`. Secret olmadan doğrulama "warn-and-allow" modunda kalır.
2. **Her gateway'in sandbox'ında bir gerçek webhook gönder**, doğrulama geçiyor mu kontrol et (imza şemaları standart dokümana göre yazıldı; canlı veriyle teyit şart).
3. Üçü de doğrulanınca **`WEBHOOK_REQUIRE_SIGNATURE=true`** yap (prod'da imzasız webhook'u reddet).
4. (Opsiyonel) `WALLET_DRIFT_TOLERANCE` (varsayılan 0.01), `RECONCILIATION_INTERVAL_MINUTES` (varsayılan 60), kullanıcı bazlı `wallet_balances.overdraft_limit` (NULL = sınırsız).

## B. Build & test (bu WSL ortamında koşamadıklarım)
5. **Frontend:** Windows'ta `npm run build` + `npm run test:run` çalıştır. WSL'de esbuild Windows binary'leri olduğu için frontend Vitest koşamadı — `CurrencyContext.jsx` ve `UserBalances.jsx` JSX değişikliklerini build ile doğrula.
6. **Backend:** Kendi makinende `cd backend && npm test` koş. 3 suite (`wallet-deposits`, `paymentWebhooks`, `finances-balance-sync`) `sharp` modülü eksik olduğu için yüklenemiyordu — `npm install --include=optional sharp` ile düzelt, sonra tekrar koş.

## C. Davranış değişikliklerini onayla (iş kararı)
7. **Booking/shop-order silme iadeleri** artık gerçekte cüzdandan çekileni iade ediyor (currency-doğru, hybrid'de sadece cüzdan porsiyonu). Cüzdan charge'ı OLMAYAN (kartla ödenmiş) siparişlerde eski "EUR store-credit" davranışı korundu. **Karar:** kart iadeleri cüzdana mı yoksa karta mı yapılmalı?
8. **Deposit auto-complete** artık sadece `admin/manager/owner/front_desk/receptionist`. Rol setini onayla.
9. **`formatCurrency` kuruş gösteriyor** (örn. €1.50). TRY gibi tam-sayı beklenen yerlerde UI'ı gözle kontrol et (gerekirse `currency_settings.decimal_places=0` ayarla).

## D. Henüz YAPILMADI — senin domain girdin gerekiyor
10. **Accommodation lock→capture:** cüzdan ödemeli konaklama parası `pending`'de kilitli kalıyor, hiç capture edilmiyor. Yaşam döngüsü karmaşık (create/confirm/check-in/cancel × wallet/card/bank/pay_later) — birlikte ele almalıyız. `accommodation.js:625` (lock), `:470` (release).
11. **finances.js yıkıcı yollar:** transaction hardDelete (`~1102`) ve balance reset (`~1481`) defteri arşivlemeden siliyor (users.js artık arşivliyor). İstersen aynı arşiv desenini buralara da ekleriz.
12. **Legacy `users.balance` fallback** (`users.js:388`, `finances.js:423`): cüzdan SSOT olduğuna göre emekliye ayrılmalı mı? "Pre-wallet borçlu müşteriler"i etkiler — senin kararın.
13. **StudentWalletModal** başlığı "Total Balance" = available+pending; dashboard sadece available gösteriyor. Etiketi standartlaştır.
14. **WalletModalManager** çift-conversion yuvarlaması (TRY→EUR→TRY, iki `Math.ceil`) — düşük etki, görsel doğrula.
15. **memberOfferings:** tamamlanmış cüzdan üyelik satın alımı cancel'da iade edilmiyor (sadece pending iptal). İstenen bu mu?

## E. Operasyon & izleme
16. Loglarda **`[WALLET-DRIFT]`** alarmlarını izle (reconciliation `RECONCILIATION_INTERVAL_MINUTES`'te bir koşar). Drift çıkarsa araştır, sonra **bilinçli olarak** `recomputeBalanceFromLedger(userId, currency)` çağır (otomatik sessiz overwrite YOK).
17. **Bir kerelik mevcut drift taraması yap:** bu düzeltmelerden ÖNCE oluşmuş drift'i yakala (özellikle 2026-05-30/31 Rifat / −191k incident'larından kalıntı). `findBalanceLedgerDrift({ tolerance: 0.01 })`.

## F. Deploy / migration
18. Migration **265** + **266** local'de uygulandı. Prod deploy'da `npm run migrate:up` (push-all bunu yapıyor). **265**'in deposit UNIQUE index'i mevcut duplicate varsa atlanır → migration NOTICE'ını kontrol et (varsa duplicate'leri temizleyip tekrar koş).
19. **Idempotency key'leri sadece YENİ transaction'lara uygulanır.** Eski/uçuştaki kayıtlarda key yok — bu beklenen; geriye dönük backfill gerekmez.

---

## Değiştirdiğim dosyalar
**Backend (modified):** `walletService.js`, `wallet.js`, `paymentGatewayWebhookService.js`, `agent.js`, `server.js`, `rentals.js`, `studentPortalService.js`, `bookings.js`, `shopOrders.js`, `services.js`, `users.js`, `finances.js`, `financialReconciliationService.js`
**Backend (new):** `migrations/265_wallet_integrity_hardening.sql`, `migrations/266_deleted_user_wallet_archive.sql`
**Frontend:** `CurrencyContext.jsx`, `UserBalances.jsx` (modified), `utils/formatCurrencyValue.js` (new)
**Tests (new):** 5 backend (`wallet-integrity-hardening`, `wallet-wave2-critical`, `wallet-wave3-refunds`, `wallet-wave3b-consistency`, `wallet-wave5-reconciliation`) + 1 frontend (`formatCurrencyValue`)
**Doküman:** `WALLET_AUDIT.md` (tam denetim), `WALLET_FIXES_AND_CHECKLIST.md` (bu dosya)

> Not: `services.js` ve `finances.js`'te senin önceki commit'lenmemiş WIP'in de var; benim değişikliklerim onlardan ayrı satırlarda. Hiçbir WIP'ine dokunmadım.
