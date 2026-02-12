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

  // --- Round-trip: complex queries ---

  it('should round-trip a complex query with DISTINCT aggregates', () => {
    const sql = 'SELECT a, COUNT(DISTINCT b, c), SUM(DISTINCT d) FROM t1 WHERE e > 1 GROUP BY a'
    expect(getParsedSql(sql)).to.be.equal(
      'SELECT `a`, COUNT(DISTINCT `b`, `c`), SUM(DISTINCT `d`) FROM `t1` WHERE `e` > 1 GROUP BY `a`'
    )
  })
})
