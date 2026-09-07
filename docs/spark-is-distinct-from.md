# Spark `IS [NOT] DISTINCT FROM` support (KML-6147)

## Symptom

Previewing a query in the product returns a syntax error. The failing construct
is the null-safe equality operator:

```sql
SELECT v.cameraID FROM video v WHERE v.objectType IS DISTINCT FROM v.eventType
```

`node-sql-parser` does not support `IS DISTINCT FROM`. There is a corresponding
upstream issue for the Postgres dialect:
[taozhi8833998/node-sql-parser#2659](https://github.com/taozhi8833998/node-sql-parser/issues/2659).

## Dialect survey

Measured against each dialect in this repo (parse + round-trip):

| Dialect      | `a.x IS DISTINCT FROM a.y` | `IS NOT DISTINCT FROM` | `IS DISTINCT FROM TRUE` / `NULL` |
| ------------ | -------------------------- | ---------------------- | -------------------------------- |
| `flinksql`   | works                      | works                  | works                            |
| `spark`      | fails                      | fails                  | fails                            |
| `hive`       | fails                      | fails                  | fails                            |
| `postgresql` | works                      | fails                  | fails                            |

Spark inherits the gap from Hive, which it was forked from.

Postgres only *appears* to work. Its `is_op_right` carries a
`KW_DISTINCT __ KW_FROM __ table_name` branch that parses the right operand as a
**table name** and re-emits it as an `origin` string. That covers the qualified
`tbl.col` shape by coincidence and nothing else. The same branch appears in
`noql`, `trino`, `redshift` and `snowflake`.

`flinksql` is the only dialect with a real implementation, so it is the model
used here.

## Change

**File: `pegjs/spark.pegjs`** (only — Hive is a separate supported dialect and
keeps its own behavior.)

1. Two new rules, placed after `between_or_not_between_op`:

   ```pegjs
   distinct_from_op
     = KW_IS __ KW_NOT __ KW_DISTINCT __ KW_FROM { return 'IS NOT DISTINCT FROM'; }
     / KW_IS __ KW_DISTINCT __ KW_FROM { return 'IS DISTINCT FROM'; }

   distinct_from_op_right
     = op:distinct_from_op __ right:(expr) {
         return { op: op, right: right };
       }
   ```

2. `distinct_from_op_right` wired into `comparison_op_right`:

   ```pegjs
   comparison_op_right
     = arithmetic_op_right
     / in_op_right
     / between_op_right
     / distinct_from_op_right
     / is_op_right
     / like_op_right
     / rlike_op_right
   ```

**Ordering matters.** `distinct_from_op_right` must precede `is_op_right`,
whose first alternative is `KW_IS __ additive_expr` and would otherwise consume
the `IS` before the `DISTINCT FROM` tail is ever considered. This is the same
ordering `flinksql` uses.

No `src/` change is required. `createBinaryExpr` produces a standard
`binary_expr`, and the shared binary-expr serializer emits the operator string
verbatim, so a multi-word operator round-trips without special handling. All
four tokens (`KW_IS`, `KW_NOT`, `KW_DISTINCT`, `KW_FROM`) already existed in the
grammar.

## Operand scope

The right operand is the full `expr` rule, matching `flinksql`. This accepts
literals, qualified column references and subqueries. It does **not**
over-consume across boolean operators — for
`a IS DISTINCT FROM b AND c IS NULL` the top-level AST operator is `AND`, with
the `IS DISTINCT FROM` node as its left child.

## Verification

```
npx mochapack "test/spark.spec.js"    # 65 passing (was 59; 6 new)
npx mochapack "test/hive.spec.js"     # 10 passing, still rejects the syntax
npm test                              # 1580 passing, 1 pending
```

Forms covered by the new tests in `test/spark.spec.js`: `WHERE`, select list,
`CASE WHEN`, `JOIN ... ON`, subquery operand, literal operands
(`NULL` / `TRUE` / string), and AND/OR precedence. `SELECT DISTINCT` and
`IS [NOT] NULL` are asserted unaffected.

**Engine check.** Both operators were run against Spark 3.5.1 and DuckDB over
the rows `(1,1), (1,2), (NULL,1), (NULL,NULL)`. Both engines return identical
null-safe results, confirming the syntax is valid Spark SQL and not merely
parseable:

| `a`    | `b`    | `a IS DISTINCT FROM b` | `a IS NOT DISTINCT FROM b` |
| ------ | ------ | ---------------------- | -------------------------- |
| 1      | 1      | false                  | true                       |
| 1      | 2      | true                   | false                      |
| `NULL` | 1      | true                   | false                      |
| `NULL` | `NULL` | false                  | true                       |

## Scope intentionally not changed

- **The Postgres dialect remains half-implemented** (see the survey above).
  Fixing it means replacing the `table_name` branch in its `is_op_right` with
  the same two rules. Whether the product's preview path needs the Postgres
  dialect as well as Spark is an open question.
- `hive`, `trino`, `redshift`, `snowflake` and `noql` carry the same gap and are
  untouched.
