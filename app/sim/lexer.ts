/**
 * Lexer for the C-like DSL accepted by the J4M6 simulator.
 *
 * Supports only what the L00-L05 lessons actually use. Keeps types
 * coarse (NUMBER / IDENT / OP / PUNCT / DIRECTIVE / EOF). Keywords
 * stay as IDENT — the parser is what cares whether `while` is a
 * statement keyword or a variable name.
 *
 * Position tracking is line + column (1-indexed), used downstream by
 * the interpreter to highlight the active line in the editor.
 */

export type TokenType = 'NUMBER' | 'IDENT' | 'OP' | 'PUNCT' | 'DIRECTIVE' | 'STRING' | 'EOF'

export interface Token {
  type: TokenType
  value: string
  /** Numeric value when type === 'NUMBER'. */
  num?: number
  line: number
  col: number
}

export class LexError extends Error {
  constructor(public line: number, public col: number, msg: string) {
    super(`Lex error at ${line}:${col} — ${msg}`)
    this.name = 'LexError'
  }
}

// Ordered longest-first so '<<=' is matched before '<<' before '<'.
const MULTI_CHAR_OPS = [
  '<<=', '>>=',
  '&&', '||', '<<', '>>',
  '<=', '>=', '==', '!=',
  '|=', '&=', '^=', '+=', '-=', '*=', '/=', '%=',
  '++', '--', '->'
]

const SINGLE_CHAR_OPS = '+-*/%&|^~!<>=?:'
const PUNCT = '(){}[];,'

export function lex(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let line = 1
  let col = 1
  const N = source.length

  const here = () => ({line, col})

  function advance(n = 1): string {
    let out = ''
    for (let k = 0; k < n && i < N; k++) {
      const c = source[i++]
      out += c
      if (c === '\n') { line++; col = 1 }
      else col++
    }
    return out
  }
  function peek(offset = 0): string {
    return source[i + offset] ?? ''
  }
  function startsWith(s: string): boolean {
    return source.substr(i, s.length) === s
  }

  while (i < N) {
    const c = source[i]!

    // whitespace
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
      advance()
      continue
    }

    // line comment //
    if (c === '/' && peek(1) === '/') {
      while (i < N && source[i] !== '\n') advance()
      continue
    }
    // block comment /* ... */
    if (c === '/' && peek(1) === '*') {
      advance(2)
      while (i < N && !startsWith('*/')) advance()
      if (i < N) advance(2)
      continue
    }

    // string literal — content kept as-is (no escape decoding). The parser
    // doesn't execute strings; this just lets code containing `printf(...)`
    // or `__asm__ volatile("...")` lex without error.
    if (c === '"') {
      const start = here()
      advance() // opening "
      let raw = ''
      while (i < N && source[i] !== '"' && source[i] !== '\n') {
        if (source[i] === '\\' && i + 1 < N) {
          raw += advance(2) // backslash + next char
        } else {
          raw += source[i]!
          advance()
        }
      }
      if (i < N && source[i] === '"') advance() // closing "
      tokens.push({type: 'STRING', value: raw, line: start.line, col: start.col})
      continue
    }

    // preprocessor directive — consume entire line
    if (c === '#') {
      const start = here()
      // capture the directive word for the parser to discriminate
      // #define vs #include vs others.
      let raw = ''
      while (i < N && source[i] !== '\n') {
        // splice line continuations (\ at EOL)
        if (source[i] === '\\' && (source[i + 1] === '\n' || source[i + 1] === '\r')) {
          advance() // backslash
          if (source[i] === '\r') advance()
          if (source[i] === '\n') advance()
          continue
        }
        raw += source[i]!
        advance()
      }
      tokens.push({type: 'DIRECTIVE', value: raw, line: start.line, col: start.col})
      continue
    }

    // number literal
    if (isDigit(c)) {
      const start = here()
      let raw = ''
      let value = 0
      if (c === '0' && (peek(1) === 'x' || peek(1) === 'X')) {
        raw += advance(2)
        const hexStart = i
        while (i < N && isHex(source[i]!)) { raw += source[i]!; advance() }
        if (i === hexStart) throw new LexError(start.line, start.col, 'malformed hex literal')
        value = parseInt(raw.slice(2), 16)
      } else if (c === '0' && (peek(1) === 'b' || peek(1) === 'B')) {
        raw += advance(2)
        const bStart = i
        while (i < N && (source[i] === '0' || source[i] === '1')) { raw += source[i]!; advance() }
        if (i === bStart) throw new LexError(start.line, start.col, 'malformed binary literal')
        value = parseInt(raw.slice(2), 2)
      } else {
        while (i < N && isDigit(source[i]!)) { raw += source[i]!; advance() }
        value = parseInt(raw, 10)
      }
      // optional integer-suffix: U, u, L, l, UL, etc — just consume
      while (i < N && /[uUlL]/.test(source[i]!)) { raw += source[i]!; advance() }
      tokens.push({type: 'NUMBER', value: raw, num: value >>> 0, line: start.line, col: start.col})
      continue
    }

    // identifier / keyword
    if (isIdentStart(c)) {
      const start = here()
      let raw = ''
      while (i < N && isIdentCont(source[i]!)) { raw += source[i]!; advance() }
      tokens.push({type: 'IDENT', value: raw, line: start.line, col: start.col})
      continue
    }

    // multi-char op (longest match wins)
    let matched = false
    for (const op of MULTI_CHAR_OPS) {
      if (startsWith(op)) {
        const start = here()
        advance(op.length)
        tokens.push({type: 'OP', value: op, line: start.line, col: start.col})
        matched = true
        break
      }
    }
    if (matched) continue

    // single-char op
    if (SINGLE_CHAR_OPS.includes(c)) {
      const start = here()
      advance()
      tokens.push({type: 'OP', value: c, line: start.line, col: start.col})
      continue
    }

    // punctuation
    if (PUNCT.includes(c)) {
      const start = here()
      advance()
      tokens.push({type: 'PUNCT', value: c, line: start.line, col: start.col})
      continue
    }

    throw new LexError(line, col, `unexpected character ${JSON.stringify(c)}`)
  }

  tokens.push({type: 'EOF', value: '', line, col})
  return tokens
}

function isDigit(c: string) { return c >= '0' && c <= '9' }
function isHex(c: string) { return isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F') }
function isIdentStart(c: string) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' }
function isIdentCont(c: string) { return isIdentStart(c) || isDigit(c) }
