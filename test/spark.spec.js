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
    expect(getParsedSql(sql)).to.be.equal('SELECT `a`, `b` FROM `t1`')
  })

  it('should parse SELECT with WHERE', () => {
    const sql = 'SELECT * FROM t1 WHERE id = 1'
    expect(getParsedSql(sql)).to.be.equal('SELECT * FROM `t1` WHERE `id` = 1')
  })

  it('should parse SELECT DISTINCT', () => {
    const sql = 'SELECT DISTINCT a, b FROM t1'
    expect(getParsedSql(sql)).to.be.equal('SELECT DISTINCT `a`, `b` FROM `t1`')
  })

  // --- Multi-column DISTINCT in COUNT ---

  it('should support COUNT(DISTINCT a, b)', () => {
    const sql = 'SELECT COUNT(DISTINCT a, b) FROM t1'
    expect(getParsedSql(sql)).to.be.equal('SELECT COUNT(DISTINCT `a`, `b`) FROM `t1`')
  })

  it('should support COUNT(DISTINCT a, b, c)', () => {
    const sql = 'SELECT COUNT(DISTINCT a, b, c) FROM t1'
    expect(getParsedSql(sql)).to.be.equal('SELECT COUNT(DISTINCT `a`, `b`, `c`) FROM `t1`')
  })

  it('should support COUNT(DISTINCT col) single column', () => {
    const sql = 'SELECT COUNT(DISTINCT a) FROM t1'
    expect(getParsedSql(sql)).to.be.equal('SELECT COUNT(DISTINCT `a`) FROM `t1`')
  })

  it('should support COUNT(*)', () => {
    const sql = 'SELECT COUNT(*) FROM t1'
    expect(getParsedSql(sql)).to.be.equal('SELECT COUNT(*) FROM `t1`')
  })

  // --- DISTINCT in SUM/AVG/MIN/MAX ---

  it('should support SUM(DISTINCT col)', () => {
    const sql = 'SELECT SUM(DISTINCT amount) FROM orders'
    expect(getParsedSql(sql)).to.be.equal('SELECT SUM(DISTINCT `amount`) FROM `orders`')
  })

  it('should support AVG(DISTINCT col)', () => {
    const sql = 'SELECT AVG(DISTINCT score) FROM students'
    expect(getParsedSql(sql)).to.be.equal('SELECT AVG(DISTINCT `score`) FROM `students`')
  })

  it('should support MIN and MAX without DISTINCT', () => {
    const sql = 'SELECT MIN(a), MAX(b) FROM t1'
    expect(getParsedSql(sql)).to.be.equal('SELECT MIN(`a`), MAX(`b`) FROM `t1`')
  })

  // --- Spark-specific JOINs ---

  it('should support LEFT SEMI JOIN', () => {
    const sql = 'SELECT * FROM a LEFT SEMI JOIN b ON a.id = b.id'
    expect(getParsedSql(sql)).to.be.equal('SELECT * FROM `a` LEFT SEMI JOIN `b` ON `a`.`id` = `b`.`id`')
  })

  it('should support LEFT ANTI JOIN', () => {
    const sql = 'SELECT * FROM a LEFT ANTI JOIN b ON a.id = b.id'
    expect(getParsedSql(sql)).to.be.equal('SELECT * FROM `a` LEFT ANTI JOIN `b` ON `a`.`id` = `b`.`id`')
  })

  // --- Window functions: LAG/LEAD/FIRST_VALUE/LAST_VALUE/ROW_NUMBER/RANK ---

  it('should support LAG with OVER', () => {
    const sql = 'SELECT LAG(amount, 1) OVER (PARTITION BY user_id ORDER BY created_at) FROM orders'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT LAG(`amount`, 1) OVER (PARTITION BY `user_id` ORDER BY `created_at` ASC) FROM `orders`'
    )
  })

  it('should support LEAD with OVER', () => {
    const sql = 'SELECT LEAD(amount, 1, 0) OVER (ORDER BY created_at) FROM orders'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT LEAD(`amount`, 1, 0) OVER (ORDER BY `created_at` ASC) FROM `orders`'
    )
  })

  it('should support ROW_NUMBER', () => {
    const sql = 'SELECT ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary) FROM employees'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT ROW_NUMBER() OVER (PARTITION BY `dept` ORDER BY `salary` ASC) FROM `employees`'
    )
  })

  it('should support RANK and DENSE_RANK', () => {
    const sql = 'SELECT RANK() OVER (ORDER BY score DESC), DENSE_RANK() OVER (ORDER BY score DESC) FROM students'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT RANK() OVER (ORDER BY `score` DESC), DENSE_RANK() OVER (ORDER BY `score` DESC) FROM `students`'
    )
  })

  it('should support FIRST_VALUE', () => {
    const sql = 'SELECT FIRST_VALUE(name) OVER (PARTITION BY dept ORDER BY salary DESC) FROM employees'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT FIRST_VALUE(`name`) OVER (PARTITION BY `dept` ORDER BY `salary` DESC) FROM `employees`'
    )
  })

  it('should support LAST_VALUE', () => {
    const sql = 'SELECT LAST_VALUE(name) OVER (PARTITION BY dept ORDER BY salary) FROM employees'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT LAST_VALUE(`name`) OVER (PARTITION BY `dept` ORDER BY `salary` ASC) FROM `employees`'
    )
  })

  it('should support LAG with IGNORE NULLS', () => {
    const sql = 'SELECT LAG(amount, 1) IGNORE NULLS OVER (ORDER BY created_at) FROM orders'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT LAG(`amount`, 1) IGNORE NULLS OVER (ORDER BY `created_at` ASC) FROM `orders`'
    )
  })

  // --- ILIKE ---

  it('should support ILIKE', () => {
    const sql = "SELECT * FROM t1 WHERE name ILIKE '%john%'"
    expect(getParsedSql(sql)).to.be.equal("SELECT * FROM `t1` WHERE `name` ILIKE '%john%'")
  })

  it('should support NOT ILIKE', () => {
    const sql = "SELECT * FROM t1 WHERE name NOT ILIKE '%test%'"
    expect(getParsedSql(sql)).to.be.equal("SELECT * FROM `t1` WHERE `name` NOT ILIKE '%test%'")
  })

  // --- LATERAL VIEW ---

  it('should support LATERAL VIEW EXPLODE', () => {
    const sql = 'SELECT col1, col2 FROM t1 LATERAL VIEW EXPLODE(arr) tmp AS col2'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT `col1`, `col2` FROM `t1` LATERAL VIEW EXPLODE(`arr`) `tmp` AS `col2`'
    )
  })

  it('should support LATERAL VIEW OUTER EXPLODE', () => {
    const sql = 'SELECT col1, col2 FROM t1 LATERAL VIEW OUTER EXPLODE(arr) tmp AS col2'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT `col1`, `col2` FROM `t1` LATERAL VIEW OUTER EXPLODE(`arr`) `tmp` AS `col2`'
    )
  })

  it('should support chained LATERAL VIEWs', () => {
    const sql = 'SELECT a, b, c FROM t1 LATERAL VIEW EXPLODE(arr1) t2 AS b LATERAL VIEW EXPLODE(arr2) t3 AS c'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT `a`, `b`, `c` FROM `t1` LATERAL VIEW EXPLODE(`arr1`) `t2` AS `b` LATERAL VIEW EXPLODE(`arr2`) `t3` AS `c`'
    )
  })

  it('should support LATERAL VIEW with multiple columns', () => {
    const sql = 'SELECT k, v FROM t1 LATERAL VIEW EXPLODE(map_col) tmp AS k, v'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT `k`, `v` FROM `t1` LATERAL VIEW EXPLODE(`map_col`) `tmp` AS `k`, `v`'
    )
  })

  it('should support LATERAL VIEW POSEXPLODE', () => {
    const sql = 'SELECT pos, val FROM t1 LATERAL VIEW POSEXPLODE(arr) tmp AS pos, val'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT `pos`, `val` FROM `t1` LATERAL VIEW POSEXPLODE(`arr`) `tmp` AS `pos`, `val`'
    )
  })

  // --- Complex data types ---

  it('should support CAST to BOOLEAN', () => {
    const sql = "SELECT CAST(1 AS BOOLEAN) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT CAST(1 AS BOOLEAN) FROM `t1`")
  })

  it('should support CAST to BINARY', () => {
    const sql = "SELECT CAST(col AS BINARY) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT CAST(`col` AS BINARY) FROM `t1`")
  })

  it('should support CAST to ARRAY<INT>', () => {
    const sql = "SELECT CAST(col AS ARRAY<INT>) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT CAST(`col` AS ARRAY<INT>) FROM `t1`")
  })

  it('should support CAST to MAP<STRING, INT>', () => {
    const sql = "SELECT CAST(col AS MAP<STRING, INT>) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT CAST(`col` AS MAP<STRING, INT>) FROM `t1`")
  })

  it('should support CAST to STRUCT<name STRING, age INT>', () => {
    const sql = "SELECT CAST(col AS STRUCT<name STRING, age INT>) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT CAST(`col` AS STRUCT<name STRING, age INT>) FROM `t1`")
  })

  // --- DISTRIBUTE BY / SORT BY / CLUSTER BY ---

  // --- GROUP BY with ordinal positions ---

  it('should support GROUP BY with ordinal positions', () => {
    const sql = 'SELECT a, b, COUNT(*) FROM t1 GROUP BY 1, 2'
    expect(getParsedSql(sql)).to.be.equal('SELECT `a`, `b`, COUNT(*) FROM `t1` GROUP BY 1, 2')
  })

  it('should support GROUP BY with single ordinal', () => {
    const sql = 'SELECT a, COUNT(*) FROM t1 GROUP BY 1'
    expect(getParsedSql(sql)).to.be.equal('SELECT `a`, COUNT(*) FROM `t1` GROUP BY 1')
  })

  // --- DISTRIBUTE BY / SORT BY / CLUSTER BY ---

  it('should support DISTRIBUTE BY', () => {
    const sql = 'SELECT a, b FROM t1 DISTRIBUTE BY a'
    expect(getParsedSql(sql)).to.be.equal('SELECT `a`, `b` FROM `t1` DISTRIBUTE BY `a`')
  })

  it('should support SORT BY', () => {
    const sql = 'SELECT a, b FROM t1 SORT BY a'
    expect(getParsedSql(sql)).to.be.equal('SELECT `a`, `b` FROM `t1` SORT BY `a` ASC')
  })

  it('should support SORT BY DESC', () => {
    const sql = 'SELECT a, b FROM t1 SORT BY a DESC'
    expect(getParsedSql(sql)).to.be.equal('SELECT `a`, `b` FROM `t1` SORT BY `a` DESC')
  })

  it('should support CLUSTER BY', () => {
    const sql = 'SELECT a, b FROM t1 CLUSTER BY a'
    expect(getParsedSql(sql)).to.be.equal('SELECT `a`, `b` FROM `t1` CLUSTER BY `a`')
  })

  it('should support DISTRIBUTE BY with SORT BY', () => {
    const sql = 'SELECT a, b FROM t1 DISTRIBUTE BY a SORT BY b ASC'
    expect(getParsedSql(sql)).to.be.equal("SELECT `a`, `b` FROM `t1` DISTRIBUTE BY `a` SORT BY `b` ASC")
  })

  it('should support DISTRIBUTE BY with multiple columns', () => {
    const sql = 'SELECT a, b, c FROM t1 DISTRIBUTE BY a, b'
    expect(getParsedSql(sql)).to.be.equal('SELECT `a`, `b`, `c` FROM `t1` DISTRIBUTE BY `a`, `b`')
  })

  // --- Spark functions via generic func_call ---

  it('should support COLLECT_LIST', () => {
    const sql = 'SELECT COLLECT_LIST(col) FROM t1 GROUP BY id'
    expect(getParsedSql(sql)).to.be.equal('SELECT COLLECT_LIST(`col`) FROM `t1` GROUP BY `id`')
  })

  it('should support COLLECT_SET', () => {
    const sql = 'SELECT COLLECT_SET(col) FROM t1 GROUP BY id'
    expect(getParsedSql(sql)).to.be.equal('SELECT COLLECT_SET(`col`) FROM `t1` GROUP BY `id`')
  })

  it('should support CONCAT_WS', () => {
    const sql = "SELECT CONCAT_WS(',', a, b) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT CONCAT_WS(',', `a`, `b`) FROM `t1`")
  })

  it('should support SPLIT', () => {
    const sql = "SELECT SPLIT(name, ',') FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT SPLIT(`name`, ',') FROM `t1`")
  })

  it('should support REGEXP_EXTRACT', () => {
    const sql = "SELECT REGEXP_EXTRACT(str, '(\\\\w+)', 1) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT REGEXP_EXTRACT(`str`, '(\\\\w+)', 1) FROM `t1`")
  })

  it('should support DATE_ADD', () => {
    const sql = "SELECT DATE_ADD(dt, 1) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT DATE_ADD(`dt`, 1) FROM `t1`")
  })

  it('should support DATE_SUB', () => {
    const sql = "SELECT DATE_SUB(dt, 1) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT DATE_SUB(`dt`, 1) FROM `t1`")
  })

  it('should support DATEDIFF', () => {
    const sql = "SELECT DATEDIFF(end_date, start_date) FROM t1"
    expect(getParsedSql(sql)).to.be.equal("SELECT DATEDIFF(`end_date`, `start_date`) FROM `t1`")
  })

  // --- Round-trip: complex queries ---

  it('should round-trip a complex query with DISTINCT aggregates', () => {
    const sql = 'SELECT a, COUNT(DISTINCT b, c), SUM(DISTINCT d) FROM t1 WHERE e > 1 GROUP BY a'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT `a`, COUNT(DISTINCT `b`, `c`), SUM(DISTINCT `d`) FROM `t1` WHERE `e` > 1 GROUP BY `a`'
    )
  })
})
