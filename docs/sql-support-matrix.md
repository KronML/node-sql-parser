# SQL support matrix — what our SQL generator may emit

Reference for the query-generating agent. Every row was verified empirically, not
inferred from documentation:

- **Parser** — `@kronml/node-sql-parser` v1.0.9, `spark` dialect (`parser.astify(sql, { database: 'spark' })`).
  "yes" means the SQL both parses and round-trips through `sqlify` unchanged.
- **Spark** — executed on Spark 3.5.1, default (non-ANSI) mode.
- **DuckDB** — executed on DuckDB 1.3.2.

A construct is only safe to emit when **all three** columns say yes. The parser is
the gate for query preview; the engines are the gate for execution.

---

## 1. Safe everywhere — prefer these

| Construct | Parser | Spark | DuckDB |
| --- | :-: | :-: | :-: |
| `IS DISTINCT FROM` / `IS NOT DISTINCT FROM` | yes | yes | yes |
| `IS [NOT] NULL` | yes | yes | yes |
| `IS [NOT] TRUE` / `IS [NOT] FALSE` | yes | yes | yes |
| `IS UNKNOWN` / `IS NOT UNKNOWN` | yes | yes | yes |
| `LIKE` / `NOT LIKE` | yes | yes | yes |
| `ILIKE` | yes | yes | yes |
| `BETWEEN` / `NOT BETWEEN` | yes | yes | yes |
| `IN (…)` / `NOT IN (…)` | yes | yes | yes |
| `IN (subquery)` | yes | yes | yes |
| `EXISTS (subquery)` | yes | yes | yes |
| `UNION` / `UNION ALL` | yes | yes | yes |
| `EXCEPT` / `EXCEPT ALL` | yes | yes | yes |
| `INTERSECT` / `INTERSECT ALL` | yes | yes | yes |
| `CASE WHEN … THEN … ELSE … END` | yes | yes | yes |
| `CAST(x AS type)` | yes | yes | yes |
| `TRY_CAST(x AS type)` | yes | yes | yes |
| Bitwise `&` and `\|` | yes | yes | yes |
| Unary bitwise `~` | yes | yes | yes |
| Modulo `%` | yes | yes | yes |
| String concat `\|\|` | yes | yes | yes |
| Array subscript `arr[i]` | yes | yes | yes |
| `GROUP BY CUBE(…)` / `ROLLUP(…)` | yes | yes | yes |
| `COUNT(DISTINCT …)` | yes | yes | yes |
| Window `ROWS BETWEEN … PRECEDING AND CURRENT ROW` | yes | yes | yes |
| Window `RANGE BETWEEN INTERVAL n unit PRECEDING …` | yes | yes | yes |
| Common table expressions (`WITH … AS (…)`) | yes | yes | yes |

**Null-safe equality — use `IS NOT DISTINCT FROM`.** It is the portable spelling.
Spark also accepts `<=>`, but DuckDB does not, and our parser does not support it
either. Never emit `<=>`.

---

## 2. Hard traps — read before emitting

### `^` means different things in the two engines

This is the most dangerous item in this document, because nothing errors — you
just get a **silently wrong number**.

| Expression | Spark | DuckDB |
| --- | --- | --- |
| `6 ^ 3` | `5` (bitwise XOR) | `216.0` (exponentiation, 6³) |

**Never emit `^` unless the target engine is known.** Our parser accepts `^` and
treats it as Spark's XOR, so a preview will look fine while DuckDB computes
something else entirely.

There is **no portable spelling for bitwise XOR** — the two engines share neither
an operator nor a function name:

| Intent | Spark 3.5.1 | DuckDB 1.3.2 |
| --- | --- | --- |
| Bitwise XOR | `a ^ b` (`xor(a,b)` does **not** exist) | `xor(a, b)` (`^` is power) |
| Exponentiation | `power(a, b)` | `power(a, b)` or `a ** b` or `a ^ b` |

Use `power(a, b)` for exponentiation — that one *is* portable.

### Constructs the parser accepts but an engine rejects

The query will pass preview and then fail at execution:

| Construct | Parser | Spark | DuckDB | Emit instead |
| --- | :-: | :-: | :-: | --- |
| `= ANY (subquery)`, `> ALL (subquery)` | yes | **no** | yes | `IN (subquery)` / `EXISTS` |
| `x::type` cast | yes | **no** | yes | `CAST(x AS type)` |
| `COLLATE` | yes | **no** | **no** | omit |
| `LATERAL VIEW EXPLODE` | yes | yes | **no** | — |
| `IGNORE NULLS` | yes | yes | **no** | — |
| `v:field` (variant access) | yes | not on 3.5.1 | **no** | — |

`::` and `COLLATE` are Spark 4.0 features; we run Spark 3.5.1.

---

## 3. Spark-only — safe for Spark, rejected by DuckDB

Emit only when the target engine is known to be Spark.

| Construct | Parser | Spark | DuckDB | DuckDB equivalent |
| --- | :-: | :-: | :-: | --- |
| `REGEXP` / `NOT REGEXP` | yes | yes | **no** | `~` or `regexp_matches(s, p)` |
| `RLIKE` / `NOT RLIKE` | yes | yes | **no** | `~` or `regexp_matches(s, p)` |
| `DIV` (integer division) | yes | yes | **no** | `//` |
| `MINUS` (as `EXCEPT`) | **no** | yes | **no** | `EXCEPT` |
| `<=>` (null-safe equal) | **no** | yes | **no** | `IS NOT DISTINCT FROM` |

`MINUS` is deliberately not supported by the parser: it is Spark-only, `EXCEPT` is
the portable equivalent, and reserving the word would have blocked `minus` as an
ordinary column name. **Emit `EXCEPT`.**

---

## 4. DuckDB-only — rejected by Spark 3.5.1

Do not emit these unless the target is known to be DuckDB. None are supported by
the parser today, so they will also fail query preview.

`SIMILAR TO`, `GLOB`, `**` (power), `//` (integer division), JSON `->` and `->>`,
`AT TIME ZONE`, `QUALIFY`, `<<` and `>>` (bit shifts).

Spark spells the shifts as `shiftleft(x, n)` / `shiftright(x, n)`.

---

## 5. Not supported by the parser — do not emit

Valid in Spark, but our parser rejects them, so they fail at query preview:

- Nested struct field access beyond one level (`st.f.g`). One level (`t.col`) is fine.
- Lambda expressions / higher-order functions — `transform(arr, x -> x + 1)`, `filter`, `aggregate`.
- `FILTER (WHERE …)` on aggregates — use `SUM(CASE WHEN … THEN … END)` instead.
- `GROUPING SETS` — `CUBE` and `ROLLUP` do work.
- `TABLESAMPLE`, `PIVOT`.
- `<=>`, `MINUS` (see §3).

---

## 6. Quoting and identifiers

- Identifier quoting is **backticks**: `` `col with space` ``. Plain identifiers are
  emitted unquoted.
- `EXCEPT` and `INTERSECT` are reserved and cannot be used as bare identifiers.
  Quote them (`` `except` ``) or qualify them (`t.except`).
- `minus`, `div` and `regexp` remain usable as ordinary column names.

---

## 7. Notes on window frames

`RANGE` frames with a value or `INTERVAL` bound require **exactly one** `ORDER BY`
expression, of date, timestamp or numeric type. Both engines enforce this:

- DuckDB: `RANGE frames must have only one ORDER BY expression`
- Spark: `DATATYPE_MISMATCH.RANGE_FRAME_MULTI_ORDER`

Interval units accept both singular and plural (`INTERVAL 1 DAY`, `INTERVAL 29 DAYS`).

DuckDB supports a maximum of 3-part table names; Spark uses a 3-level namespace.
Do not generate 4-part qualified names.
