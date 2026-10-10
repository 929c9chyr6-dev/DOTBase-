# AUTOPROVOZ — Changelog

Změny verzí aplikace PNEU/DOT/TASK se od 10. 10. 2026 zaznamenávají zde.
Starší historii lze dohledat v GitHub commitech; zpětně jí nepřiřazujeme neověřená čísla verzí.

## Unreleased — návrh ke kontrole

### Přidáno
- Návrh denního zálohování všech souborů Vercel Blob do odděleného privátního úložiště.
- Kontrola úplnosti kopie a manifest s kontrolními součty SHA-256.
- Automatické testování při Pull Requestu.
- Postup pro stabilní Git tagy, návrat k předchozí verzi, zápis release notes a test obnovy.

### Omezení a otevřené body
- Denní zálohy **nejsou spuštěné**, dokud nebude připraveno cílové privátní úložiště, jeho token a ověřená obnova.
- Záloha není atomický snímek dat; jednotlivé Blob soubory se mohou během zálohování změnit.
- Automatické mazání starých záloh a upozornění na selhání zatím nejsou zapnuté.
- Produkční data ani aktuální aplikace se v tomto návrhu nemění.

## Šablona dalších vydání

### vX.Y.Z — YYYY-MM-DD
- Nové funkce:
- Opravené chyby:
- Úpravy rozhraní:
- Migrace dat:
- Známé problémy:
- Ověřená záloha:
- Git commit a Vercel deployment:
- Postup rollbacku:
