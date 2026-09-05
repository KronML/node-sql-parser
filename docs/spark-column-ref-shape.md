# Spark `column_ref` AST shape — alignment with Postgres

## Symptom

When the Spark dialect parses a `SELECT` whose projected columns have **no
alias**, downstream consumers (validation, query optimization) produce
unexpected output. The same queries work correctly under the Postgres dialect.

Example:

```sql
SELECT col1 FROM t
```

## Investigation

Our Spark grammar was forked from Hive. Hive's `column_ref` returns the column
name as a **raw string**:

```js
{ type: 'column_ref', table: null, column: 'col1', collate: null }
```

Postgres's `column_ref` wraps the column name in a structured object:

```js
{ type: 'column_ref', table: null,
  column: { expr: { type: 'default', value: 'col1' } },
  collate: null }
```

Our downstream code was written against the Postgres AST. It reads the column
name as `expr.column.expr.value`. Under Spark that path resolved to `undefined`
(since `column` was the string `'col1'`, not an object), which is the
"unexpected output" we were seeing.

**Why only un-aliased columns?** When an alias exists, downstream code reads
the `as` field directly — that field is identical across dialects, so the bug
is invisible. The shape difference only matters when callers fall back to
reading the column name itself out of the AST.

### Diff demonstrating the issue

For `SELECT col1 FROM t`:

| Dialect  | `columns[0].expr.column`                                          |
| -------- | ----------------------------------------------------------------- |
| Postgres | `{ expr: { type: 'default', value: 'col1' } }`                    |
| Spark    | `'col1'`                                                          |

### Where it lives in the grammar

- `pegjs/spark.pegjs` — `column_ref` (returned the raw string from the
  `column` rule).
- `pegjs/postgresql.pegjs` — `column_ref` (wraps in `{ expr: col }`, where
  `col` comes from `column_type` / `column_without_kw_type`, which return
  either `{ type: 'default', value }` for unquoted names or a
  `quoted_ident_type` object for quoted names).

## Inference

The grammar was the source of the shape mismatch, not the sqlify pipeline.
`columnOffsetToSQL` in `src/column.js` already handles both string and object
shapes for `column`:

- `typeof column === 'string'` → `identifierToSql(column)`
- otherwise destructure `{ expr, offset, suffix }` and run `exprToSQL(expr)`

A `{ type: 'default', value }` node routes through `exprToSQL` →
`literalToSQL`, which falls through to the default case and emits the raw
`value`. That matches the Spark identifier policy (no backtick quoting on
plain identifiers, per commit `a1d8070`).

## Change

**File: `pegjs/spark.pegjs`**

1. Added two new rules that produce the structured-object form of a column
   name (mirroring the Postgres grammar):

   ```pegjs
   column_type
     = name:column_name !{ return reservedMap[name.toUpperCase()] === true; } {
         return { type: 'default', value: name }
       }
     / quoted_ident_type

   column_without_kw_type
     = n:column_name {
         return { type: 'default', value: n }
       }
     / quoted_ident_type
   ```

   `column_type` rejects reserved keywords (used when no table prefix is
   present); `column_without_kw_type` accepts them (allowed after a table
   prefix, e.g. `t.select`).

2. Rewrote `column_ref` to use these rules and wrap the result:

   ```pegjs
   column_ref
     = tbl:ident __ DOT __ col:column_without_kw_type ce:(__ collate_expr)? {
         columnList.add(`select::${tbl}::${col.value}`);
         return {
           type: 'column_ref',
           table: tbl,
           column: { expr: col },
           collate: ce && ce[1],
         };
       }
     / col:column_type ce:(__ collate_expr)? {
         columnList.add(`select::null::${col.value}`);
         return {
           type: 'column_ref',
           table: null,
           column: { expr: col },
           collate: ce && ce[1],
         };
       }
   ```

   Note: `columnList.add(...)` calls now use `col.value` since `col` is an
   object.

**File: `test/spark.spec.js`**

Added a shape-assertion test that locks the new contract in place — both for
unquoted identifiers (`{ type: 'default', value }`) and backtick-quoted
identifiers (`{ type: 'backticks_quote_string', value }`). The `*` projection
keeps its original literal-string shape (`column: '*'`), since that is also
how Postgres represents it.

## Rationale

- **Match Postgres for downstream compatibility.** The user's validation and
  query-rewrite code is written against Postgres's AST. Aligning Spark's
  `column_ref` shape removes the divergence rather than special-casing the
  consumer code per dialect.
- **No change to sqlify behavior.** Round-trip tests confirm the SQL output
  is unchanged for every existing Spark test case.
- **Preserves quoting information.** A backtick-quoted column ends up as
  `{ type: 'backticks_quote_string', value }`, matching how Postgres preserves
  `double_quote_string` etc. Previously, all quoting metadata was discarded
  (the `quoted_ident` rule returned only `v.value`).
- **Reserved-word handling kept faithful to Postgres.** `t.select` is allowed
  after a table prefix (via `column_without_kw_type`), `select` alone is not
  (via `column_type`).

## Scope intentionally not changed

These are related shape differences in Postgres that we did **not** address
in this change, because they are independent of the reported symptom. Calling
them out so future work has a starting point:

- **3-part column references (`schema.table.col`).** Postgres has a dedicated
  `column_ref` branch (`postgresql.pegjs:4728-4753`) that emits `schema`,
  `table`, and `column` fields separately. Spark's `column_ref` still handles
  only `tbl.col` and bare `col`. (Commit `a1d8070` added 3-part support for
  table names, not for column refs.)
- **`column_ref_quoted`.** Postgres has a rule that recognises a bare
  double-quoted string as a column reference rather than a string literal.
  Spark does not.

## Verification

```
npx mochapack "test/spark.spec.js"
# 55 passing
```

Hive tests also re-run cleanly (no shared rule changes).

To distribute this fix to consumers, run `npm run build` so `lib/` and
`output/prod` are regenerated from the updated grammar.
