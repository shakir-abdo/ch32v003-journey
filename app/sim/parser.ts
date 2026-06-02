/**
 * Hand-rolled recursive-descent parser for the DSL.
 *
 * Two phases:
 *  1. Scan tokens, collect every #define into a macro table. Discard
 *     directives we don't care about (#include, #pragma, #ifdef, etc.).
 *  2. Parse the rest into a Program AST.
 *
 * Macros are stored as already-parsed Expr nodes. The interpreter
 * expands them lazily when an identifier reference is evaluated.
 *
 * Casts of the form `(volatile u32*)expr` are parsed and preserved as
 * `Cast` nodes — the interpreter treats them as no-ops; only the inner
 * expression's numeric value is used.
 */

import type {
  AssignExpr, AssignOp, BinaryExpr, BinaryOp,
  Block, CastExpr, CallExpr, Define, DerefExpr, Expr,
  ForStmt, FuncDef, GroupExpr, Ident, IfStmt, NumberLit,
  Program, Stmt, TernaryExpr, UnaryExpr, UnaryOp,
  VarDecl, WhileStmt, ExprStmt, Loc
} from './ast'
import {lex, type Token} from './lexer'

export class ParseError extends Error {
  constructor(public token: Token, msg: string) {
    super(`Parse error at ${token.line}:${token.col} — ${msg}`)
    this.name = 'ParseError'
  }
}

const C_TYPE_KEYWORDS = new Set([
  'void', 'int', 'char', 'short', 'long', 'unsigned', 'signed',
  'u8', 'u16', 'u32', 'u64', 's8', 's16', 's32', 's64',
  'uint8_t', 'uint16_t', 'uint32_t', 'int8_t', 'int16_t', 'int32_t',
  'volatile', 'const', 'static'
])

export interface ParseResult {
  program: Program
  /** name → macro AST. Built from the #define directives. */
  macros: Map<string, Define>
  /** Soft diagnostics (e.g. skipped directives) — non-fatal. */
  warnings: string[]
}

export function parse(source: string): ParseResult {
  const tokens = lex(source)
  const macros = new Map<string, Define>()
  const warnings: string[] = []

  // ── Pass 1: peel off directives into the macro table, keep the rest.
  const codeTokens: Token[] = []
  for (const t of tokens) {
    if (t.type === 'DIRECTIVE') {
      const def = parseDirective(t, warnings)
      if (def) macros.set(def.name, def)
      continue
    }
    codeTokens.push(t)
  }

  // ── Pass 2: parse the remaining tokens.
  const p = new Parser(codeTokens, macros, warnings)
  const program = p.parseProgram()

  return {program, macros, warnings}
}

function parseDirective(t: Token, warnings: string[]): Define | null {
  const raw = t.value.trim()
  if (raw.startsWith('#define')) {
    const body = raw.slice('#define'.length).trimStart()
    const nameMatch = body.match(/^([A-Za-z_][A-Za-z0-9_]*)/)
    if (!nameMatch) {
      warnings.push(`Line ${t.line}: ignored unparseable #define`)
      return null
    }
    const name = nameMatch[1]!
    let rest = body.slice(name.length)
    // Function-like macros: `(` MUST immediately follow the name. A
    // space before `(` means the macro is object-like and the `(` is
    // part of its value.
    if (rest.startsWith('(')) {
      let depth = 0, i = 0
      while (i < rest.length) {
        if (rest[i] === '(') depth++
        else if (rest[i] === ')') { depth--; if (depth === 0) { i++; break } }
        i++
      }
      warnings.push(`Line ${t.line}: function-like #define ${name}() not supported in v1, ignored`)
      return null
    }
    const value = rest.trim()
    if (!value) {
      warnings.push(`Line ${t.line}: empty #define ${name} ignored`)
      return null
    }
    // Re-lex the macro body so it has its own token stream.
    const subTokens = lex(value)
    const subParser = new Parser(subTokens, new Map(), warnings)
    let expr: Expr
    try {
      expr = subParser.parseExpression()
      subParser.expect('EOF', null, 'extra tokens after macro body')
    } catch (e) {
      if (e instanceof ParseError) {
        warnings.push(`Line ${t.line}: macro ${name} parse error — ${e.message}`)
      } else {
        throw e
      }
      return null
    }
    return {
      type: 'Define',
      name,
      params: null,
      body: expr,
      startLine: t.line, endLine: t.line
    }
  }
  if (raw.startsWith('#include') || raw.startsWith('#pragma') || raw.startsWith('#ifdef') ||
      raw.startsWith('#ifndef') || raw.startsWith('#endif') || raw.startsWith('#else') ||
      raw.startsWith('#elif') || raw.startsWith('#if') || raw.startsWith('#undef') ||
      raw.startsWith('#error')) {
    // silently ignored — typical lesson code starts with #include <ch32v003fun.h>
    return null
  }
  warnings.push(`Line ${t.line}: unknown directive ${raw.split(/\s/)[0]}`)
  return null
}

// ────────────────────────────────────────────────────────────────────────
class Parser {
  private i = 0

  constructor(
    private tokens: Token[],
    private macros: Map<string, Define>,
    private warnings: string[]
  ) {}

  // ── helpers ──
  peek(offset = 0): Token { return this.tokens[this.i + offset] ?? this.tokens[this.tokens.length - 1]! }
  advance(): Token { return this.tokens[this.i++]! }
  eof(): boolean { return this.peek().type === 'EOF' }

  /** Match-and-consume helper: matches on type and optional value. */
  match(type: Token['type'], value?: string | null): Token | null {
    const t = this.peek()
    if (t.type !== type) return null
    if (value != null && t.value !== value) return null
    return this.advance()
  }
  expect(type: Token['type'], value: string | null | undefined, msg: string): Token {
    const t = this.peek()
    if (t.type !== type || (value != null && t.value !== value)) {
      throw new ParseError(t, msg)
    }
    return this.advance()
  }

  // ── top-level ──
  parseProgram(): Program {
    const start = this.peek().line
    let main: FuncDef | null = null
    const ignored: Loc[] = []

    while (!this.eof()) {
      const t = this.peek()
      // skip typedef ... ;
      if (t.type === 'IDENT' && t.value === 'typedef') {
        const skipStart = t.line
        while (!this.eof()) {
          const cur = this.advance()
          if (cur.type === 'PUNCT' && cur.value === ';') break
        }
        ignored.push({startLine: skipStart, endLine: this.peek().line})
        continue
      }
      // top-level statement OR function definition
      // crude detector: looks for IDENT IDENT '(' which means
      // `<rettype> <name> (` — function definition.
      if (this.looksLikeFunctionDef()) {
        const fn = this.parseFunctionDef()
        if (fn.name === 'main') {
          main = fn
        } else {
          this.warnings.push(`Function ${fn.name} declared but only main() runs in v1.`)
        }
        continue
      }
      // top-level statement (rare, but allowed for didactic snippets without main)
      const stmt = this.parseStatement()
      // Wrap it into a synthetic main() if no main has appeared by EOF.
      if (!main) main = {
        type: 'FuncDef', name: 'main', body: [],
        startLine: stmt.startLine, endLine: stmt.endLine
      }
      main.body.push(stmt)
      main.endLine = stmt.endLine
    }

    return {
      type: 'Program',
      defines: [...this.macros.values()],
      main,
      ignored,
      startLine: start,
      endLine: this.peek().line
    }
  }

  private looksLikeFunctionDef(): boolean {
    // Possible prefixes: `int main()`, `void main()`, `static void foo()`,
    // `int main(void)`. Scan past zero-or-more type keywords, then expect
    // an IDENT (the function name), then `(`.
    let k = 0
    while (true) {
      const t = this.peek(k)
      if (t.type === 'IDENT' && C_TYPE_KEYWORDS.has(t.value)) { k++; continue }
      break
    }
    const nameTok = this.peek(k)
    const lparen  = this.peek(k + 1)
    return nameTok.type === 'IDENT' && lparen.type === 'PUNCT' && lparen.value === '('
  }

  private parseFunctionDef(): FuncDef {
    const startTok = this.peek()
    while (this.peek().type === 'IDENT' && C_TYPE_KEYWORDS.has(this.peek().value)) this.advance()
    const name = this.expect('IDENT', null, 'expected function name').value
    this.expect('PUNCT', '(', `expected '(' after ${name}`)
    // skip param list — v1 doesn't run user-defined functions other than main
    while (!(this.peek().type === 'PUNCT' && this.peek().value === ')') && !this.eof()) this.advance()
    this.expect('PUNCT', ')', `expected ')' after parameters`)
    const body = this.parseBlock().body
    return {
      type: 'FuncDef', name, body,
      startLine: startTok.line,
      endLine: this.tokens[this.i - 1]?.line ?? startTok.line
    }
  }

  // ── statements ──
  parseStatement(): Stmt {
    const t = this.peek()

    if (t.type === 'PUNCT' && t.value === '{') return this.parseBlock()
    if (t.type === 'IDENT') {
      switch (t.value) {
        case 'if':       return this.parseIf()
        case 'while':    return this.parseWhile()
        case 'for':      return this.parseFor()
        case 'break':    { this.advance(); this.expect('PUNCT', ';', "expected ';' after break"); return {type: 'Break',    startLine: t.line, endLine: t.line} }
        case 'continue': { this.advance(); this.expect('PUNCT', ';', "expected ';' after continue"); return {type: 'Continue', startLine: t.line, endLine: t.line} }
        default:
          if (C_TYPE_KEYWORDS.has(t.value)) return this.parseVarDecl()
      }
    }

    return this.parseExprStmt()
  }

  parseBlock(): Block {
    const start = this.expect('PUNCT', '{', "expected '{'")
    const body: Stmt[] = []
    while (!(this.peek().type === 'PUNCT' && this.peek().value === '}') && !this.eof()) {
      body.push(this.parseStatement())
    }
    const end = this.expect('PUNCT', '}', "expected '}'")
    return {type: 'Block', body, startLine: start.line, endLine: end.line}
  }

  private parseIf(): IfStmt {
    const start = this.advance() // 'if'
    this.expect('PUNCT', '(', "expected '(' after if")
    const test = this.parseExpression()
    this.expect('PUNCT', ')', "expected ')' after if condition")
    const consequent = this.parseStatement()
    let alternate: Stmt | undefined
    if (this.peek().type === 'IDENT' && this.peek().value === 'else') {
      this.advance()
      alternate = this.parseStatement()
    }
    return {
      type: 'If', test, consequent, alternate,
      startLine: start.line,
      endLine: (alternate ?? consequent).endLine
    }
  }

  private parseWhile(): WhileStmt {
    const start = this.advance() // 'while'
    this.expect('PUNCT', '(', "expected '(' after while")
    const test = this.parseExpression()
    this.expect('PUNCT', ')', "expected ')' after while condition")
    const body = this.parseStatement()
    return {type: 'While', test, body, startLine: start.line, endLine: body.endLine}
  }

  private parseFor(): ForStmt {
    const start = this.advance() // 'for'
    this.expect('PUNCT', '(', "expected '(' after for")
    let init: VarDecl | ExprStmt | undefined
    if (!(this.peek().type === 'PUNCT' && this.peek().value === ';')) {
      const t = this.peek()
      if (t.type === 'IDENT' && C_TYPE_KEYWORDS.has(t.value)) {
        init = this.parseVarDecl()
      } else {
        init = this.parseExprStmt()
      }
    } else this.advance()

    let test: Expr | undefined
    if (!(this.peek().type === 'PUNCT' && this.peek().value === ';')) {
      test = this.parseExpression()
    }
    this.expect('PUNCT', ';', "expected ';' in for header")

    let update: Expr | undefined
    if (!(this.peek().type === 'PUNCT' && this.peek().value === ')')) {
      update = this.parseExpression()
    }
    this.expect('PUNCT', ')', "expected ')' to close for header")
    const body = this.parseStatement()
    return {type: 'For', init, test, update, body, startLine: start.line, endLine: body.endLine}
  }

  private parseVarDecl(): VarDecl {
    const startTok = this.peek()
    const typeWords: string[] = []
    while (this.peek().type === 'IDENT' && C_TYPE_KEYWORDS.has(this.peek().value)) {
      typeWords.push(this.advance().value)
    }
    const nameTok = this.expect('IDENT', null, 'expected variable name')
    let init: Expr | undefined
    if (this.match('OP', '=')) {
      init = this.parseExpression()
    }
    const end = this.expect('PUNCT', ';', "expected ';' after declaration")
    return {
      type: 'VarDecl',
      declType: typeWords.join(' '),
      name: nameTok.value,
      init,
      startLine: startTok.line,
      endLine: end.line
    }
  }

  private parseExprStmt(): ExprStmt {
    const startLine = this.peek().line
    const expr = this.parseExpression()
    const end = this.expect('PUNCT', ';', "expected ';' after expression")
    return {type: 'ExprStmt', expr, startLine, endLine: end.line}
  }

  // ── expressions ──
  /**
   * Pratt-style precedence climbing. We parse a primary first, then a
   * binary tail repeatedly. Assignment is right-associative and parsed
   * recursively at its precedence level.
   */
  parseExpression(): Expr {
    return this.parseAssignment()
  }

  private parseAssignment(): Expr {
    const left = this.parseTernary()
    const t = this.peek()
    if (t.type === 'OP' && ASSIGN_OPS.has(t.value)) {
      const op = t.value as AssignOp
      this.advance()
      const right = this.parseAssignment()
      if (left.type !== 'Ident' && left.type !== 'Deref') {
        throw new ParseError(t, 'left side of assignment must be a name or dereferenced address')
      }
      return {
        type: 'Assign', op, target: left, value: right,
        startLine: left.startLine, endLine: right.endLine
      } as AssignExpr
    }
    return left
  }

  private parseTernary(): Expr {
    const test = this.parseLogicalOr()
    if (this.match('OP', '?')) {
      const consequent = this.parseAssignment()
      this.expect('OP', ':', "expected ':' in ternary")
      const alternate = this.parseAssignment()
      return {
        type: 'Ternary', test, consequent, alternate,
        startLine: test.startLine, endLine: alternate.endLine
      } as TernaryExpr
    }
    return test
  }

  private parseLogicalOr():   Expr { return this.binaryLoop(['||'],          () => this.parseLogicalAnd()) }
  private parseLogicalAnd():  Expr { return this.binaryLoop(['&&'],          () => this.parseBitwiseOr()) }
  private parseBitwiseOr():   Expr { return this.binaryLoop(['|'],           () => this.parseBitwiseXor()) }
  private parseBitwiseXor():  Expr { return this.binaryLoop(['^'],           () => this.parseBitwiseAnd()) }
  private parseBitwiseAnd():  Expr { return this.binaryLoop(['&'],           () => this.parseEquality()) }
  private parseEquality():    Expr { return this.binaryLoop(['==','!='],     () => this.parseRelational()) }
  private parseRelational():  Expr { return this.binaryLoop(['<','<=','>','>='], () => this.parseShift()) }
  private parseShift():       Expr { return this.binaryLoop(['<<','>>'],     () => this.parseAdditive()) }
  private parseAdditive():    Expr { return this.binaryLoop(['+','-'],       () => this.parseMultiplicative()) }
  private parseMultiplicative(): Expr { return this.binaryLoop(['*','/','%'], () => this.parseUnary()) }

  private binaryLoop(ops: string[], next: () => Expr): Expr {
    let left = next()
    while (this.peek().type === 'OP' && ops.includes(this.peek().value)) {
      const op = this.advance().value as BinaryOp
      const right = next()
      left = {
        type: 'Binary', op, left, right,
        startLine: left.startLine, endLine: right.endLine
      } as BinaryExpr
    }
    return left
  }

  private parseUnary(): Expr {
    const t = this.peek()
    if (t.type === 'OP' && (t.value === '!' || t.value === '~' || t.value === '-' || t.value === '+')) {
      this.advance()
      const arg = this.parseUnary()
      return {
        type: 'Unary', op: t.value as UnaryOp, arg,
        startLine: t.line, endLine: arg.endLine
      } as UnaryExpr
    }
    // C-style dereference: `*expr`
    if (t.type === 'OP' && t.value === '*') {
      this.advance()
      const target = this.parseUnary()
      return {
        type: 'Deref', target,
        startLine: t.line, endLine: target.endLine
      } as DerefExpr
    }
    return this.parsePostfix()
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary()
    // No postfix ops in v1 (no [], ->, ., ++/--).
    return expr
  }

  private parsePrimary(): Expr {
    const t = this.peek()

    if (t.type === 'NUMBER') {
      this.advance()
      return {type: 'Number', value: t.num ?? 0, raw: t.value, startLine: t.line, endLine: t.line} as NumberLit
    }

    if (t.type === 'IDENT') {
      // Function call?
      if (this.peek(1).type === 'PUNCT' && this.peek(1).value === '(') {
        const nameTok = this.advance()
        this.advance() // consume '('
        const args: Expr[] = []
        if (!(this.peek().type === 'PUNCT' && this.peek().value === ')')) {
          args.push(this.parseAssignment())
          while (this.match('PUNCT', ',')) {
            args.push(this.parseAssignment())
          }
        }
        const close = this.expect('PUNCT', ')', "expected ')' after call args")
        return {
          type: 'Call', callee: nameTok.value, args,
          startLine: nameTok.line, endLine: close.line
        } as CallExpr
      }
      this.advance()
      return {type: 'Ident', name: t.value, startLine: t.line, endLine: t.line} as Ident
    }

    if (t.type === 'PUNCT' && t.value === '(') {
      // Could be a cast `(volatile u32*)expr` or a grouping `(expr)`.
      const lparen = this.advance()
      // Detect cast: a sequence of type-keywords (optionally followed
      // by `*` for pointer types) terminated by `)`.
      if (this.isCastAhead()) {
        const typeWords: string[] = []
        while (this.peek().type === 'IDENT' && C_TYPE_KEYWORDS.has(this.peek().value)) {
          typeWords.push(this.advance().value)
        }
        while (this.peek().type === 'OP' && this.peek().value === '*') {
          typeWords.push(this.advance().value)
        }
        this.expect('PUNCT', ')', "expected ')' to close cast")
        const inner = this.parseUnary()
        return {
          type: 'Cast', declType: typeWords.join(' '), expr: inner,
          startLine: lparen.line, endLine: inner.endLine
        } as CastExpr
      }
      const inner = this.parseExpression()
      const close = this.expect('PUNCT', ')', "expected ')' after grouped expression")
      return {
        type: 'Group', expr: inner,
        startLine: lparen.line, endLine: close.line
      } as GroupExpr
    }

    throw new ParseError(t, `unexpected ${t.type} '${t.value}'`)
  }

  /** Peek for cast pattern after consuming '('. */
  private isCastAhead(): boolean {
    let k = 0
    let sawType = false
    while (true) {
      const t = this.peek(k)
      if (t.type === 'IDENT' && C_TYPE_KEYWORDS.has(t.value)) { sawType = true; k++; continue }
      if (t.type === 'OP' && t.value === '*' && sawType) { k++; continue }
      break
    }
    if (!sawType) return false
    const closing = this.peek(k)
    return closing.type === 'PUNCT' && closing.value === ')'
  }
}

const ASSIGN_OPS = new Set(['=', '|=', '&=', '^=', '<<=', '>>=', '+=', '-=', '*=', '/=', '%='])
