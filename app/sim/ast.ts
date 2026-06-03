/**
 * AST node types for the DSL.
 *
 * Every node carries the originating source line range so the interpreter
 * can hand the editor "highlight lines L..M" for the currently executing
 * statement. Line numbers are 1-indexed and match the lexer's output.
 */

export interface Loc {
  startLine: number
  endLine: number
}

export type Node = Program | TopLevel | Stmt | Expr

// ── Top level ─────────────────────────────────────────────────────────
export interface Program extends Loc {
  type: 'Program'
  defines: Define[]
  /** main() body — the interpreter starts here. */
  main: FuncDef | null
  /** Every parsed function keyed by name. The interpreter uses this to
   * dispatch ISRs (SysTick_Handler, EXTI7_0_IRQHandler, …) and may also
   * service plain function calls in future versions. */
  functions: Map<string, FuncDef>
  /** Anything outside main + #define (e.g. typedef, #include) — preserved for editor mapping. */
  ignored: Loc[]
}

export type TopLevel = Define | FuncDef

export interface Define extends Loc {
  type: 'Define'
  name: string
  /** Function-style #define FOO(a,b) is not supported in v1. */
  params: null
  /** Macro body, kept un-evaluated. Evaluated when the macro is used. */
  body: Expr
}

export interface FuncDef extends Loc {
  type: 'FuncDef'
  name: string
  body: Stmt[]
}

// ── Statements ───────────────────────────────────────────────────────
export type Stmt =
  | Block
  | IfStmt
  | WhileStmt
  | ForStmt
  | ExprStmt
  | VarDecl
  | BreakStmt
  | ContinueStmt

export interface Block extends Loc { type: 'Block'; body: Stmt[] }

export interface IfStmt extends Loc {
  type: 'If'
  test: Expr
  consequent: Stmt
  alternate?: Stmt
}

export interface WhileStmt extends Loc {
  type: 'While'
  test: Expr
  body: Stmt
}

export interface ForStmt extends Loc {
  type: 'For'
  init?: VarDecl | ExprStmt
  test?: Expr
  update?: Expr
  body: Stmt
}

export interface ExprStmt extends Loc { type: 'ExprStmt'; expr: Expr }

export interface VarDecl extends Loc {
  type: 'VarDecl'
  /** Declared C type (best-effort string, ignored at runtime — we use u32). */
  declType: string
  name: string
  init?: Expr
}

export interface BreakStmt    extends Loc { type: 'Break' }
export interface ContinueStmt extends Loc { type: 'Continue' }

// ── Expressions ──────────────────────────────────────────────────────
export type Expr =
  | NumberLit
  | Ident
  | UnaryExpr
  | BinaryExpr
  | TernaryExpr
  | AssignExpr
  | CallExpr
  | CastExpr
  | DerefExpr
  | GroupExpr

export interface NumberLit extends Loc { type: 'Number'; value: number; raw: string }
export interface Ident     extends Loc { type: 'Ident';  name: string }

export type UnaryOp = '!' | '~' | '-' | '+'
export interface UnaryExpr extends Loc { type: 'Unary'; op: UnaryOp; arg: Expr }

export type BinaryOp =
  | '+' | '-' | '*' | '/' | '%'
  | '<<' | '>>'
  | '&' | '|' | '^'
  | '<' | '<=' | '>' | '>=' | '==' | '!='
  | '&&' | '||'
export interface BinaryExpr extends Loc { type: 'Binary'; op: BinaryOp; left: Expr; right: Expr }

export interface TernaryExpr extends Loc { type: 'Ternary'; test: Expr; consequent: Expr; alternate: Expr }

export type AssignOp = '=' | '|=' | '&=' | '^=' | '<<=' | '>>=' | '+=' | '-=' | '*=' | '/=' | '%='
export interface AssignExpr extends Loc {
  type: 'Assign'
  op: AssignOp
  /** Either an Ident or a DerefExpr — the only assignable targets. */
  target: Ident | DerefExpr
  value: Expr
}

export interface CallExpr  extends Loc { type: 'Call'; callee: string; args: Expr[] }
export interface CastExpr  extends Loc { type: 'Cast'; declType: string; expr: Expr }
export interface DerefExpr extends Loc { type: 'Deref'; target: Expr }
export interface GroupExpr extends Loc { type: 'Group'; expr: Expr }
