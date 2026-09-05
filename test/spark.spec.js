const { expect } = require('chai')
const Parser = require('../src/parser').default

describe('Spark', () => {
  const parser = new Parser();
  const option = { database: 'spark' }

  function getParsedSql(sql, opt = option) {
    const ast = parser.astify(sql, opt);
    return parser.sqlify(ast, opt);
  }

  // --- Basic SELECT ---

  it('should parse basic SELECT', () => {
    const sql = 'SELECT a, b FROM t1'
    expect(getParsedSql(sql)).to.be.equal('SELECT a, b FROM t1')
  })

  it('should parse SELECT with WHERE', () => {
    const sql = 'SELECT * FROM t1 WHERE id = 1'
    expect(getParsedSql(sql)).to.be.equal('SELECT * FROM t1 WHERE id = 1')
  })

  it('should parse SELECT DISTINCT', () => {
    const sql = 'SELECT DISTINCT a, b FROM t1'
    expect(getParsedSql(sql)).to.be.equal('SELECT DISTINCT a, b FROM t1')
  })

  // --- Multi-column DISTINCT in COUNT ---

  it('should support COUNT(DISTINCT a, b)', () => {
    const sql = 'SELECT COUNT(DISTINCT a, b) FROM t1'
    expect(getParsedSql(sql)).to.be.equal('SELECT COUNT(DISTINCT a, b) FROM t1')
  })

  it('should support COUNT(DISTINCT a, b, c)', () => {
    const sql = 'SELECT COUNT(DISTINCT a, b, c) FROM t1'
    expect(getParsedSql(sql)).to.be.equal('SELECT COUNT(DISTINCT a, b, c) FROM t1')
  })

  it('should support COUNT(DISTINCT col) single column', () => {
    const sql = 'SELECT COUNT(DISTINCT a) FROM t1'
    expect(getParsedSql(sql)).to.be.equal('SELECT COUNT(DISTINCT a) FROM t1')
  })

  it('should support COUNT(*)', () => {
    const sql = 'SELECT COUNT(*) FROM t1'
    expect(getParsedSql(sql)).to.be.equal('SELECT COUNT(*) FROM t1')
  })

  // --- DISTINCT in SUM/AVG/MIN/MAX ---

  it('should support SUM(DISTINCT col)', () => {
    const sql = 'SELECT SUM(DISTINCT amount) FROM orders'
    expect(getParsedSql(sql)).to.be.equal('SELECT SUM(DISTINCT amount) FROM orders')
  })

  it('should support AVG(DISTINCT col)', () => {
    const sql = 'SELECT AVG(DISTINCT score) FROM students'
    expect(getParsedSql(sql)).to.be.equal('SELECT AVG(DISTINCT score) FROM students')
  })

  it('should support MIN and MAX without DISTINCT', () => {
    const sql = 'SELECT MIN(a), MAX(b) FROM t1'
    expect(getParsedSql(sql)).to.be.equal('SELECT MIN(a), MAX(b) FROM t1')
  })

  // --- Spark-specific JOINs ---

  it('should support LEFT SEMI JOIN', () => {
    const sql = 'SELECT * FROM a LEFT SEMI JOIN b ON a.id = b.id'
    expect(getParsedSql(sql)).to.be.equal('SELECT * FROM a LEFT SEMI JOIN b ON a.id = b.id')
  })

  it('should support LEFT ANTI JOIN', () => {
    const sql = 'SELECT * FROM a LEFT ANTI JOIN b ON a.id = b.id'
    expect(getParsedSql(sql)).to.be.equal('SELECT * FROM a LEFT ANTI JOIN b ON a.id = b.id')
  })

  // --- Window functions: LAG/LEAD/FIRST_VALUE/LAST_VALUE/ROW_NUMBER/RANK ---

  it('should support LAG with OVER', () => {
    const sql = 'SELECT LAG(amount, 1) OVER (PARTITION BY user_id ORDER BY created_at) FROM orders'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT LAG(amount, 1) OVER (PARTITION BY user_id ORDER BY created_at ASC) FROM orders'
    )
  })

  it('should support LEAD with OVER', () => {
    const sql = 'SELECT LEAD(amount, 1, 0) OVER (ORDER BY created_at) FROM orders'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT LEAD(amount, 1, 0) OVER (ORDER BY created_at ASC) FROM orders'
    )
  })

  it('should support ROW_NUMBER', () => {
    const sql = 'SELECT ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary) FROM employees'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary ASC) FROM employees'
    )
  })

  it('should support RANK and DENSE_RANK', () => {
    const sql = 'SELECT RANK() OVER (ORDER BY score DESC), DENSE_RANK() OVER (ORDER BY score DESC) FROM students'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT RANK() OVER (ORDER BY score DESC), DENSE_RANK() OVER (ORDER BY score DESC) FROM students'
    )
  })

  it('should support FIRST_VALUE', () => {
    const sql = 'SELECT FIRST_VALUE(name) OVER (PARTITION BY dept ORDER BY salary DESC) FROM employees'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT FIRST_VALUE(name) OVER (PARTITION BY dept ORDER BY salary DESC) FROM employees'
    )
  })

  it('should support LAST_VALUE', () => {
    const sql = 'SELECT LAST_VALUE(name) OVER (PARTITION BY dept ORDER BY salary) FROM employees'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT LAST_VALUE(name) OVER (PARTITION BY dept ORDER BY salary ASC) FROM employees'
    )
  })

  it('should support LAG with IGNORE NULLS', () => {
    const sql = 'SELECT LAG(amount, 1) IGNORE NULLS OVER (ORDER BY created_at) FROM orders'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT LAG(amount, 1) IGNORE NULLS OVER (ORDER BY created_at ASC) FROM orders'
    )
  })

  // --- ILIKE ---

  it('should support ILIKE', () => {
    const sql = "SELECT * FROM t1 WHERE name ILIKE '%john%'"
    expect(getParsedSql(sql)).to.be.equal("SELECT * FROM t1 WHERE name ILIKE '%john%'")
  })

  it('should support NOT ILIKE', () => {
    const sql = "SELECT * FROM t1 WHERE name NOT ILIKE '%test%'"
    expect(getParsedSql(sql)).to.be.equal("SELECT * FROM t1 WHERE name NOT ILIKE '%test%'")
  })

  // --- LATERAL VIEW ---

  it('should support LATERAL VIEW EXPLODE', () => {
    const sql = 'SELECT col1, col2 FROM t1 LATERAL VIEW EXPLODE(arr) tmp AS col2'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT col1, col2 FROM t1 LATERAL VIEW EXPLODE(arr) tmp AS col2'
    )
  })

  it('should support LATERAL VIEW OUTER EXPLODE', () => {
    const sql = 'SELECT col1, col2 FROM t1 LATERAL VIEW OUTER EXPLODE(arr) tmp AS col2'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT col1, col2 FROM t1 LATERAL VIEW OUTER EXPLODE(arr) tmp AS col2'
    )
  })

  it('should support chained LATERAL VIEWs', () => {
    const sql = 'SELECT a, b, c FROM t1 LATERAL VIEW EXPLODE(arr1) t2 AS b LATERAL VIEW EXPLODE(arr2) t3 AS c'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT a, b, c FROM t1 LATERAL VIEW EXPLODE(arr1) t2 AS b LATERAL VIEW EXPLODE(arr2) t3 AS c'
    )
  })

  it('should support LATERAL VIEW with multiple columns', () => {
    const sql = 'SELECT k, v FROM t1 LATERAL VIEW EXPLODE(map_col) tmp AS k, v'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT k, v FROM t1 LATERAL VIEW EXPLODE(map_col) tmp AS k, v'
    )
  })

  it('should support LATERAL VIEW POSEXPLODE', () => {
    const sql = 'SELECT pos, val FROM t1 LATERAL VIEW POSEXPLODE(arr) tmp AS pos, val'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT pos, val FROM t1 LATERAL VIEW POSEXPLODE(arr) tmp AS pos, val'
    )
  })

  // --- Complex data types ---

  it('should support CAST to BOOLEAN', () => {
    const sql = "SELECT CAST(1 AS BOOLEAN) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT CAST(1 AS BOOLEAN) FROM t1")
  })

  it('should support CAST to BINARY', () => {
    const sql = "SELECT CAST(col AS BINARY) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT CAST(col AS BINARY) FROM t1")
  })

  it('should support CAST to ARRAY<INT>', () => {
    const sql = "SELECT CAST(col AS ARRAY<INT>) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT CAST(col AS ARRAY<INT>) FROM t1")
  })

  it('should support CAST to MAP<STRING, INT>', () => {
    const sql = "SELECT CAST(col AS MAP<STRING, INT>) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT CAST(col AS MAP<STRING, INT>) FROM t1")
  })

  it('should support CAST to STRUCT<name STRING, age INT>', () => {
    const sql = "SELECT CAST(col AS STRUCT<name STRING, age INT>) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT CAST(col AS STRUCT<name STRING, age INT>) FROM t1")
  })

  // --- DISTRIBUTE BY / SORT BY / CLUSTER BY ---

  // --- GROUP BY with ordinal positions ---

  it('should support GROUP BY with ordinal positions', () => {
    const sql = 'SELECT a, b, COUNT(*) FROM t1 GROUP BY 1, 2'
    expect(getParsedSql(sql)).to.be.equal('SELECT a, b, COUNT(*) FROM t1 GROUP BY 1, 2')
  })

  it('should support GROUP BY with single ordinal', () => {
    const sql = 'SELECT a, COUNT(*) FROM t1 GROUP BY 1'
    expect(getParsedSql(sql)).to.be.equal('SELECT a, COUNT(*) FROM t1 GROUP BY 1')
  })

  // --- DISTRIBUTE BY / SORT BY / CLUSTER BY ---

  it('should support DISTRIBUTE BY', () => {
    const sql = 'SELECT a, b FROM t1 DISTRIBUTE BY a'
    expect(getParsedSql(sql)).to.be.equal('SELECT a, b FROM t1 DISTRIBUTE BY a')
  })

  it('should support SORT BY', () => {
    const sql = 'SELECT a, b FROM t1 SORT BY a'
    expect(getParsedSql(sql)).to.be.equal('SELECT a, b FROM t1 SORT BY a ASC')
  })

  it('should support SORT BY DESC', () => {
    const sql = 'SELECT a, b FROM t1 SORT BY a DESC'
    expect(getParsedSql(sql)).to.be.equal('SELECT a, b FROM t1 SORT BY a DESC')
  })

  it('should support CLUSTER BY', () => {
    const sql = 'SELECT a, b FROM t1 CLUSTER BY a'
    expect(getParsedSql(sql)).to.be.equal('SELECT a, b FROM t1 CLUSTER BY a')
  })

  it('should support DISTRIBUTE BY with SORT BY', () => {
    const sql = 'SELECT a, b FROM t1 DISTRIBUTE BY a SORT BY b ASC'
    expect(getParsedSql(sql)).to.be.equal("SELECT a, b FROM t1 DISTRIBUTE BY a SORT BY b ASC")
  })

  it('should support DISTRIBUTE BY with multiple columns', () => {
    const sql = 'SELECT a, b, c FROM t1 DISTRIBUTE BY a, b'
    expect(getParsedSql(sql)).to.be.equal('SELECT a, b, c FROM t1 DISTRIBUTE BY a, b')
  })

  // --- Spark functions via generic func_call ---

  it('should support COLLECT_LIST', () => {
    const sql = 'SELECT COLLECT_LIST(col) FROM t1 GROUP BY id'
    expect(getParsedSql(sql)).to.be.equal('SELECT COLLECT_LIST(col) FROM t1 GROUP BY id')
  })

  it('should support COLLECT_SET', () => {
    const sql = 'SELECT COLLECT_SET(col) FROM t1 GROUP BY id'
    expect(getParsedSql(sql)).to.be.equal('SELECT COLLECT_SET(col) FROM t1 GROUP BY id')
  })

  it('should support CONCAT_WS', () => {
    const sql = "SELECT CONCAT_WS(',', a, b) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT CONCAT_WS(',', a, b) FROM t1")
  })

  it('should support SPLIT', () => {
    const sql = "SELECT SPLIT(name, ',') FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT SPLIT(name, ',') FROM t1")
  })

  it('should support REGEXP_EXTRACT', () => {
    const sql = "SELECT REGEXP_EXTRACT(str, '(\\\\w+)', 1) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT REGEXP_EXTRACT(str, '(\\\\w+)', 1) FROM t1")
  })

  it('should support DATE_ADD', () => {
    const sql = "SELECT DATE_ADD(dt, 1) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT DATE_ADD(dt, 1) FROM t1")
  })

  it('should support DATE_SUB', () => {
    const sql = "SELECT DATE_SUB(dt, 1) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT DATE_SUB(dt, 1) FROM t1")
  })

  it('should support DATEDIFF', () => {
    const sql = "SELECT DATEDIFF(end_date, start_date) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT DATEDIFF(end_date, start_date) FROM t1")
  })

  // --- Round-trip: complex queries ---

  it('should round-trip a complex query with DISTINCT aggregates', () => {
    const sql = 'SELECT a, COUNT(DISTINCT b, c), SUM(DISTINCT d) FROM t1 WHERE e > 1 GROUP BY a'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT a, COUNT(DISTINCT b, c), SUM(DISTINCT d) FROM t1 WHERE e > 1 GROUP BY a'
    )
  })

  // --- CTE with UNION ---

  it('should support simple CTE with SELECT', () => {
    const sql = 'WITH cte AS (SELECT id FROM t1) SELECT id FROM cte'
    const ast = parser.astify(sql, option);
    expect(ast).to.not.be.undefined;
    const result = parser.sqlify(ast, option);
    expect(result).to.not.be.undefined;
  })

  it('should support CTE with UNION simple', () => {
    const sql = 'WITH cte AS (SELECT id FROM t1) SELECT id FROM cte UNION SELECT id FROM t2'
    const ast = parser.astify(sql, option);
    expect(ast).to.not.be.undefined;
    const result = parser.sqlify(ast, option);
    expect(result).to.not.be.undefined;
  })

  it('should support CTE with qualified table names', () => {
    const sql = 'WITH cte AS (SELECT id FROM db.schema.table1) SELECT id FROM cte'
    const ast = parser.astify(sql, option);
    expect(ast).to.not.be.undefined;
  })

  it('should support qualified table names outside CTE', () => {
    const sql = 'SELECT id FROM db.schema.table1'
    const ast = parser.astify(sql, option);
    expect(ast).to.not.be.undefined;
  })

  it('should support two-part qualified names', () => {
    const sql = 'SELECT id FROM schema.table1'
    const ast = parser.astify(sql, option);
    expect(ast).to.not.be.undefined;
  })

  it('should support CTE with UNION', () => {
    const sql = "WITH cte AS (SELECT d.id, d.parent_id, d.post FROM KronMLTest.dbo.discussion AS d),\
    cte2 AS (SELECT discussion.id AS id, discussion.post, discussion.userid AS userid FROM KronMLTest.dbo.discussion AS discussion)\
    SELECT c.id, c3.post, c2.userid, substring('Spark SQL', 7) AS str FROM cte AS c INNER JOIN cte2 AS c2 ON c.id = c2.id\
    INNER JOIN cte2 AS c3 ON c.id = c3.id\
    UNION\
    SELECT tmp.id, tmp.post, tmp.userid, substring('Spark SQL', 7) AS str FROM (SELECT b.id, b.post, d.timestamp, d.userid FROM KronMLTest.dbo.discussion AS d\
        INNER JOIN KronMLTest.dbo.discussionboard AS b ON d.id = b.id) AS tmp"
    const ast = parser.astify(sql, option);
    expect(ast).to.not.be.undefined;
    const result = parser.sqlify(ast, option);
    expect(result).to.not.be.undefined;
  })

  // Locks in the column_ref AST shape so downstream consumers
  // (validation / query optimization) can read the column name uniformly
  // as `expr.column.expr.value`, matching the postgres dialect.
  it('column_ref wraps the column name in { expr: { type, value } }', () => {
    const ast = parser.astify('SELECT col1, t.col2, `col with space` FROM t', option);
    expect(ast.columns[0].expr.column).to.deep.equal({ expr: { type: 'default', value: 'col1' } });
    expect(ast.columns[1].expr.column).to.deep.equal({ expr: { type: 'default', value: 'col2' } });
    expect(ast.columns[1].expr.table).to.equal('t');
    expect(ast.columns[2].expr.column).to.deep.equal({ expr: { type: 'backticks_quote_string', value: 'col with space' } });
    expect(parser.sqlify(parser.astify('SELECT * FROM t', option), option)).to.equal('SELECT * FROM t');
  })

  // --- RANGE window frames with INTERVAL bounds ---
  // Spark (and DuckDB) support value-based RANGE frames where the bound is an
  // INTERVAL over a single date/timestamp ORDER BY key. These round-trip through
  // the parser so generated rolling-window queries can be re-emitted unchanged.

  it('should support RANGE BETWEEN INTERVAL n DAYS PRECEDING AND CURRENT ROW', () => {
    const sql = 'SELECT SUM(x) OVER (PARTITION BY a ORDER BY CAST(d AS TIMESTAMP) RANGE BETWEEN INTERVAL 29 DAYS PRECEDING AND CURRENT ROW) FROM t'
    expect(getParsedSql(sql)).to.be.equal('SELECT SUM(x) OVER (PARTITION BY a ORDER BY CAST(d AS TIMESTAMP) ASC RANGE BETWEEN INTERVAL 29 DAYS PRECEDING AND CURRENT ROW) FROM t')
  })

  it('should support RANGE BETWEEN INTERVAL n HOURS PRECEDING AND CURRENT ROW', () => {
    const sql = 'SELECT AVG(v) OVER (PARTITION BY a ORDER BY ts RANGE BETWEEN INTERVAL 24 HOURS PRECEDING AND CURRENT ROW) FROM t'
    expect(getParsedSql(sql)).to.be.equal('SELECT AVG(v) OVER (PARTITION BY a ORDER BY ts ASC RANGE BETWEEN INTERVAL 24 HOURS PRECEDING AND CURRENT ROW) FROM t')
  })

  it('should support RANGE with INTERVAL PRECEDING and INTERVAL FOLLOWING bounds', () => {
    const sql = 'SELECT SUM(x) OVER (ORDER BY ts RANGE BETWEEN INTERVAL 1 DAY PRECEDING AND INTERVAL 2 DAYS FOLLOWING) FROM t'
    expect(getParsedSql(sql)).to.be.equal('SELECT SUM(x) OVER (ORDER BY ts ASC RANGE BETWEEN INTERVAL 1 DAY PRECEDING AND INTERVAL 2 DAYS FOLLOWING) FROM t')
  })

  it('should accept plural INTERVAL units in a plain expression', () => {
    const sql = 'SELECT ts + INTERVAL 3 DAYS FROM t'
    expect(getParsedSql(sql)).to.be.equal('SELECT ts + INTERVAL 3 DAYS FROM t')
  })

  // --- IS [NOT] DISTINCT FROM ---
  // Null-safe equality. The right operand is a full expression, so literals,
  // qualified column refs and subqueries are all accepted.

  it('should support IS DISTINCT FROM between qualified columns', () => {
    const sql = 'SELECT v.cameraID FROM video v WHERE v.objectType IS DISTINCT FROM v.eventType'
    expect(getParsedSql(sql)).to.be.equal('SELECT v.cameraID FROM video AS v WHERE v.objectType IS DISTINCT FROM v.eventType')
  })

  it('should support IS NOT DISTINCT FROM', () => {
    const sql = 'SELECT a FROM t WHERE a IS NOT DISTINCT FROM b'
    expect(getParsedSql(sql)).to.be.equal('SELECT a FROM t WHERE a IS NOT DISTINCT FROM b')
  })

  it('should support IS DISTINCT FROM with literal operands', () => {
    expect(getParsedSql("SELECT a FROM t WHERE a IS DISTINCT FROM NULL")).to.be.equal("SELECT a FROM t WHERE a IS DISTINCT FROM NULL")
    expect(getParsedSql("SELECT a FROM t WHERE a IS DISTINCT FROM TRUE")).to.be.equal("SELECT a FROM t WHERE a IS DISTINCT FROM TRUE")
    expect(getParsedSql("SELECT a FROM t WHERE a IS DISTINCT FROM 'x'")).to.be.equal("SELECT a FROM t WHERE a IS DISTINCT FROM 'x'")
  })

  it('should support IS DISTINCT FROM with a subquery operand', () => {
    const sql = 'SELECT a FROM t WHERE a IS DISTINCT FROM (SELECT MAX(b) FROM u)'
    expect(getParsedSql(sql)).to.be.equal('SELECT a FROM t WHERE a IS DISTINCT FROM (SELECT MAX(b) FROM u)')
  })

  it('should bind IS DISTINCT FROM tighter than AND / OR', () => {
    const ast = parser.astify('SELECT a FROM t WHERE a IS DISTINCT FROM b AND c IS NULL', option)
    expect(ast.where.operator).to.be.equal('AND')
    expect(ast.where.left.operator).to.be.equal('IS DISTINCT FROM')
    expect(getParsedSql('SELECT a FROM t WHERE x = 1 AND a IS NOT DISTINCT FROM b OR y = 2'))
      .to.be.equal('SELECT a FROM t WHERE x = 1 AND a IS NOT DISTINCT FROM b OR y = 2')
  })

  it('should keep SELECT DISTINCT and IS [NOT] NULL working', () => {
    expect(getParsedSql('SELECT DISTINCT a FROM t')).to.be.equal('SELECT DISTINCT a FROM t')
    expect(getParsedSql('SELECT a FROM t WHERE a IS NOT NULL AND b IS NULL')).to.be.equal('SELECT a FROM t WHERE a IS NOT NULL AND b IS NULL')
  })

  // --- EXCEPT / INTERSECT set operators ---

  it('should support EXCEPT and INTERSECT', () => {
    expect(getParsedSql('SELECT a FROM t EXCEPT SELECT a FROM u')).to.be.equal('SELECT a FROM t EXCEPT SELECT a FROM u')
    expect(getParsedSql('SELECT a FROM t INTERSECT SELECT a FROM u')).to.be.equal('SELECT a FROM t INTERSECT SELECT a FROM u')
  })

  it('should support the ALL form of EXCEPT and INTERSECT', () => {
    expect(getParsedSql('SELECT a FROM t EXCEPT ALL SELECT a FROM u')).to.be.equal('SELECT a FROM t EXCEPT ALL SELECT a FROM u')
    expect(getParsedSql('SELECT a FROM t INTERSECT ALL SELECT a FROM u')).to.be.equal('SELECT a FROM t INTERSECT ALL SELECT a FROM u')
  })

  it('should support set operators chained with UNION', () => {
    const sql = 'SELECT a FROM t UNION SELECT a FROM u EXCEPT SELECT a FROM v'
    expect(getParsedSql(sql)).to.be.equal(sql)
  })

  // --- REGEXP (alias of RLIKE) ---

  it('should support REGEXP and NOT REGEXP', () => {
    expect(getParsedSql("SELECT a FROM t WHERE s REGEXP '^x'")).to.be.equal("SELECT a FROM t WHERE s REGEXP '^x'")
    expect(getParsedSql("SELECT a FROM t WHERE s NOT REGEXP '^x'")).to.be.equal("SELECT a FROM t WHERE s NOT REGEXP '^x'")
    expect(getParsedSql("SELECT a FROM t WHERE s RLIKE '^x'")).to.be.equal("SELECT a FROM t WHERE s RLIKE '^x'")
  })

  // --- DIV integer division ---

  it('should support DIV at multiplicative precedence', () => {
    expect(getParsedSql('SELECT a DIV b FROM t')).to.be.equal('SELECT a DIV b FROM t')
    const ast = parser.astify('SELECT a + b DIV c FROM t', option)
    expect(ast.columns[0].expr.operator).to.be.equal('+')
    expect(ast.columns[0].expr.right.operator).to.be.equal('DIV')
  })

  // --- TRY_CAST ---

  it('should support TRY_CAST', () => {
    expect(getParsedSql('SELECT TRY_CAST(a AS INT) FROM t')).to.be.equal('SELECT TRY_CAST(a AS INT) FROM t')
    expect(getParsedSql('SELECT TRY_CAST(a AS DECIMAL(10, 2)) FROM t')).to.be.equal('SELECT TRY_CAST(a AS DECIMAL(10, 2)) FROM t')
    expect(getParsedSql('SELECT CAST(a AS INT) FROM t')).to.be.equal('SELECT CAST(a AS INT) FROM t')
  })

  // --- Bitwise operators ---
  // Spark precedence: * / % DIV  >  + -  >  &  >  ^  >  |

  it('should support bitwise AND, OR and XOR', () => {
    expect(getParsedSql('SELECT a & b FROM t')).to.be.equal('SELECT a & b FROM t')
    expect(getParsedSql('SELECT a | b FROM t')).to.be.equal('SELECT a | b FROM t')
    expect(getParsedSql('SELECT a ^ b FROM t')).to.be.equal('SELECT a ^ b FROM t')
  })

  it('should bind bitwise operators at Spark precedence', () => {
    const top = sql => parser.astify(sql, option).columns[0].expr
    // + binds tighter than &
    expect(top('SELECT a + b & c FROM t').operator).to.be.equal('&')
    expect(top('SELECT a & b + c FROM t').right.operator).to.be.equal('+')
    // & tighter than ^, ^ tighter than |
    expect(top('SELECT a | b & c FROM t').operator).to.be.equal('|')
    expect(top('SELECT a ^ b & c FROM t').right.operator).to.be.equal('&')
    expect(top('SELECT a | b ^ c FROM t').right.operator).to.be.equal('^')
    // bitwise tighter than comparison
    expect(parser.astify('SELECT a FROM t WHERE a & 1 = 1', option).where.left.operator).to.be.equal('&')
  })

  it('should not confuse | with || or & with &&', () => {
    expect(getParsedSql('SELECT a || b FROM t')).to.be.equal('SELECT a || b FROM t')
    expect(getParsedSql('SELECT a FROM t WHERE x && y')).to.be.equal('SELECT a FROM t WHERE x && y')
  })

  it('should still allow MINUS as an identifier', () => {
    expect(getParsedSql('SELECT minus FROM t')).to.be.equal('SELECT minus FROM t')
  })
})
