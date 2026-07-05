#!/usr/bin/env python3
"""
원본 서버 프로젝트(asset_manager, SQLite) → 모바일 PWA(BackupData JSON) 변환.

모바일 앱의 설정 → "가져오기" 로 이 JSON 을 올리면 원본 데이터가 그대로 이전된다.

사용:
  python3 scripts/migrate-from-server.py [원본DB경로] [출력JSON경로]
  기본: ../asset_manager/data/assets.db → frontend/public/migration-backup.json

의존성 없음(python 표준 sqlite3/json 만 사용).
"""
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_SRC = Path(__file__).resolve().parents[1].parent / "asset_manager" / "data" / "assets.db"
DEFAULT_OUT = Path(__file__).resolve().parents[1] / "frontend" / "public" / "migration-backup.json"


def snake_to_camel(s: str) -> str:
    parts = s.split("_")
    return parts[0] + "".join(p.title() for p in parts[1:])


def camel_keys_deep(obj):
    """dict/list 재귀 순회하며 모든 키를 snake_case → camelCase 로 변환.
    retirement_plan JSON (원본 snake) 을 모바일 RetirementPlan(camel) 에 맞추는 데 사용."""
    if isinstance(obj, dict):
        return {snake_to_camel(k): camel_keys_deep(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [camel_keys_deep(v) for v in obj]
    return obj


def to_bool(v):
    return bool(v) if v is not None else None


# 테이블별 커스텀 변환(불린 필드). 나머지는 snake→camel 그대로.
BOOL_FIELDS = {
    "real_estate_details": {"is_owned", "has_tenant"},
    "stock_details":       {"is_pension_like"},
    "pension_details":     {"hide_in_chart"},
    "savings_details":     {"is_pension_like"},
}

# 모바일 Dexie store 이름으로 매핑(원본 테이블명 → 모바일 store명)
TABLE_MAP = {
    "assets":               "assets",
    "asset_history":        "assetHistory",
    "real_estate_details":  "realEstateDetails",
    "stock_details":        "stockDetails",
    "pension_details":      "pensionDetails",
    "savings_details":      "savingsDetails",
    "dividend_history":     "dividendHistory",
    "settings":             "settings",
}


def convert_table(con: sqlite3.Connection, src_table: str):
    bools = BOOL_FIELDS.get(src_table, set())
    cols = [r[1] for r in con.execute(f"PRAGMA table_info('{src_table}')")]
    rows = []
    for raw in con.execute(f"SELECT * FROM '{src_table}'"):
        obj = {}
        for col, val in zip(cols, raw):
            key = snake_to_camel(col)
            obj[key] = to_bool(val) if col in bools else val
        rows.append(obj)
    return rows


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT

    if not src.exists():
        sys.exit(f"원본 DB 없음: {src}")

    con = sqlite3.connect(src)
    con.row_factory = None
    tables = {}
    for src_t, dst_t in TABLE_MAP.items():
        try:
            rows = convert_table(con, src_t)
        except sqlite3.OperationalError:
            print(f"  (건너뜀) {src_t} 테이블 없음")
            continue
        tables[dst_t] = rows
        print(f"  {src_t:<22} → {dst_t:<18} {len(rows)}행")
    con.close()

    # settings.retirement_plan 값은 JSON 문자열인데 원본이 snake_case.
    # 모바일 RetirementPlan(camelCase) 에 맞게 키 재귀 변환.
    # settings KV 키 중 current_age/retirement_age 도 모바일 camel(currentAge/retirementAge) 로 변환.
    # (exchange_rate_* 는 db.getExchangeRate 가 snake 로 읽으므로 그대로 둔다)
    SETTINGS_KEY_RENAME = {"current_age": "currentAge", "retirement_age": "retirementAge"}
    for row in tables.get("settings", []):
        k = row.get("key")
        if k in SETTINGS_KEY_RENAME:
            row["key"] = SETTINGS_KEY_RENAME[k]
        elif k == "retirement_plan":
            try:
                plan = json.loads(row["value"])
                row["value"] = json.dumps(camel_keys_deep(plan), ensure_ascii=False)
                print("  retirement_plan: snake→camel 변환 적용")
            except (ValueError, TypeError):
                pass

    backup = {
        "app": "asset_manager_m",
        "version": 1,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "tables": tables,
    }

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(backup, ensure_ascii=False), encoding="utf-8")
    size_kb = out.stat().st_size / 1024
    print(f"\n✓ 변환 완료: {out} ({size_kb:.0f} KB)")
    print("  모바일 앱 설정 → 가져오기 로 이 파일을 업로드.")


if __name__ == "__main__":
    main()
