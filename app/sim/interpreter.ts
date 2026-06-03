/**
 * Step-by-step interpreter for the parsed Program AST.
 *
 * Execution model
 * ───────────────
 * One *step* advances exactly one source statement (one node in main()'s
 * body or a nested block). Loops and conditionals do not collapse into
 * a single step — entering the body, then each inner statement, all
 * count separately so the editor can highlight each line as it executes.
 *
 * Macro expansion is lazy: when an Ident is evaluated, we look it up in
 * the macro table; if found, we recursively evaluate the macro's AST.
 * That keeps the parser simple — macros are just stored expressions.
 *
 * Assignment targets
 * ──────────────────
 * The LHS of an assignment is either:
 *   - a bare Ident → a normal local variable (set in the scope chain)
 *   - a *(volatile u32*)addr expansion → an MMIO write, routed via Bus
 * For the second case, the Ident may be a macro that expands to a Deref;
 * we peel through it. Without the bus route, the assignment writes to
 * a local "fake address" map (useful for debugging but never observed).
 *
 * Built-ins
 * ─────────
 *   - Delay_Ms(ms), Delay_Us(us): treated as a single no-op statement
 *     and logged. Real timing is not modelled.
 *
 * Limits
 * ──────
 * To keep an accidental tight `while(1)` from locking the page, `run()`
 * has a per-call instruction budget. The UI can call run() repeatedly
 * to keep going (or pause).
 */

import type {
  AssignExpr, BinaryExpr, Block, CastExpr, CallExpr,
  Define, DerefExpr, Expr, ExprStmt,
  ForStmt, FuncDef, GroupExpr, Ident, IfStmt, NumberLit,
  Program, Stmt, TernaryExpr, UnaryExpr, VarDecl, WhileStmt
} from './ast'
import type {Bus} from './bus'
import type {PinChange, RegisterWrite, StepResult} from './types'
import {HANDLER_NAMES, InterruptController, type Vector} from './interrupts'

export class RuntimeError extends Error {
  constructor(public node: {startLine: number; endLine: number}, msg: string) {
    super(`Runtime error at line ${node.startLine}: ${msg}`)
    this.name = 'RuntimeError'
  }
}

interface Frame {
  /** Local variable bindings — top of the stack overrides earlier scopes. */
  vars: Map<string, number>
}

interface ExecCursor {
  /** The list of statements we are currently iterating through. */
  list: Stmt[]
  /** Index of the next statement to execute. */
  i: number
  /** Re-entry info for compound statements (loops/if). */
  reentry?:
    | {kind: 'while'; node: WhileStmt; pendingBody?: boolean}
    | {kind: 'for';   node: ForStmt;   phase: 'header' | 'body' | 'update'; pendingBody?: boolean}
    | {kind: 'if';    node: IfStmt;    branch: 'consequent' | 'alternate'}
    | {kind: 'block'; node: Block}
  /**
   * Non-null on cursors that represent an interrupt service routine.
   * When such a cursor empties, we call intc.finish(this vector) to
   * close out the interrupt and unblock the main flow.
   */
  isr?: Vector
}

/**
 * Optional per-step side-channel work the interpreter knows nothing
 * about — e.g. ticking SysTick. Returns any register/pin diffs the hook
 * caused, so the UI flashes them just like a user-driven write would.
 */
export type PostStepHook = (bus: Bus, intc: InterruptController) => {
  writes?: RegisterWrite[]
  pinChanges?: PinChange[]
} | void

export class Interpreter {
  private cursors: ExecCursor[] = []
  private callStack: Frame[] = []
  private halted = false
  private steps = 0
  /** Per-vector "we already warned this vector has no handler" flags. */
  private missingHandlerWarned = new Set<Vector>()

  constructor(
    private program: Program,
    private bus: Bus,
    private macros: Map<string, Define>,
    private intc: InterruptController,
    private hooks: {
      onLog?: (level: 'info'|'warn'|'error', msg: string) => void
      postStep?: PostStepHook[]
    } = {}
  ) {
    this.reset()
  }

  reset() {
    this.cursors = []
    this.callStack = [{vars: new Map()}]
    this.halted = false
    this.steps = 0
    this.missingHandlerWarned.clear()
    this.intc.reset()
    if (this.program.main) {
      this.cursors.push({list: this.program.main.body, i: 0})
    } else {
      this.halted = true
    }
  }

  get isHalted(): boolean { return this.halted }
  get instructionCount(): number { return this.steps }

  /**
   * Execute exactly one statement. Returns null if the program has
   * terminated. Throws RuntimeError on unrecoverable problems.
   */
  step(): StepResult | null {
    if (this.halted) return null

    // Before fetching a statement, give pending interrupts a chance to
    // jump in (lazily — only on a step boundary, so we don't preempt
    // mid-expression). If a vector is pending and no ISR is currently
    // running, push the handler onto the cursor stack so the next
    // statement we run belongs to the ISR.
    this.maybeEnterIsr()

    const stmt = this.nextStmt()
    if (!stmt) {
      this.halted = true
      return null
    }
    this.steps++

    const writes: RegisterWrite[] = []
    const pinChanges: PinChange[] = []
    let logMsg: string | undefined

    try {
      const out = this.executeStmt(stmt, writes, pinChanges)
      logMsg = out?.log
    } catch (e) {
      if (e instanceof RuntimeError) throw e
      throw new RuntimeError(stmt, (e as Error).message)
    }

    // After the statement, advance simulated time. Peripheral models that
    // care (SysTick) hook in here. Their writes get merged into this
    // step's diff so the UI flashes the affected registers.
    for (const h of this.hooks.postStep ?? []) {
      const r = h(this.bus, this.intc)
      if (r?.writes) mergeWrites(writes, r.writes)
      if (r?.pinChanges) pinChanges.push(...r.pinChanges)
    }

    return {
      lineRange: [stmt.startLine, stmt.endLine],
      writes,
      pinChanges,
      log: logMsg
    }
  }

  /**
   * If an interrupt is pending and we're not already inside one, push
   * the corresponding handler's body onto the cursor stack as an ISR
   * frame. The interpreter will then execute that body before returning
   * to main.
   */
  private maybeEnterIsr(): void {
    if (this.intc.isServicing()) return
    const v = this.intc.pickNext()
    if (!v) return

    const handlerName = Object.keys(HANDLER_NAMES).find((n) => HANDLER_NAMES[n] === v)!
    const handler = this.program.functions.get(handlerName)
    if (!handler) {
      // Real hardware would jump to the (default) handler stub and
      // typically lock. We halt with a clear message instead.
      if (!this.missingHandlerWarned.has(v)) {
        this.missingHandlerWarned.add(v)
        this.hooks.onLog?.('error', `interrupt ${v} fired but no ${handlerName}() defined — sim halts (real hw would jump to a default handler stub).`)
      }
      this.halted = true
      // Cancel the "servicing" status the controller set inside pickNext
      // so a future reset starts clean.
      this.intc.finish()
      return
    }
    this.cursors.push({list: handler.body, i: 0, isr: v})
    this.hooks.onLog?.('info', `IRQ #${v}: entering ${handlerName}()`)
  }

  /**
   * Run up to `budget` steps or until halted. Returns the accumulated
   * register/pin diffs across those steps. Caller can keep calling to
   * continue execution.
   */
  run(budget = 5000): {
    writes: RegisterWrite[]
    pinChanges: PinChange[]
    stepsRun: number
    halted: boolean
    lastLine?: [number, number]
  } {
    const writes: RegisterWrite[] = []
    const pinChanges: PinChange[] = []
    let lastLine: [number, number] | undefined
    let count = 0
    while (count < budget && !this.halted) {
      const r = this.step()
      if (!r) break
      lastLine = r.lineRange
      mergeWrites(writes, r.writes)
      pinChanges.push(...r.pinChanges)
      count++
    }
    return {writes, pinChanges, stepsRun: count, halted: this.halted, lastLine}
  }

  // ── cursor + statement walk ────────────────────────────────────────

  private nextStmt(): Stmt | null {
    while (this.cursors.length > 0) {
      const top = this.cursors[this.cursors.length - 1]!

      // Loop/if reentry
      if (top.reentry) {
        const re = top.reentry
        if (re.kind === 'while') {
          const cond = this.evalExpr(re.node.test)
          if (!cond) {
            top.reentry = undefined
            top.i++
            continue
          }
          const body = re.node.body
          // `while(1){}` — body is empty. Yield a synthetic no-op so
          // step() returns and post-step hooks (SysTick tick, interrupt
          // dispatch) still fire each iteration.
          if (body.type === 'Block' && body.body.length === 0) {
            return this.idleTick(re.node.startLine, re.node.endLine)
          }
          this.pushBody(body)
          continue
        }
        if (re.kind === 'for') {
          if (re.phase === 'header') {
            if (re.node.test && !this.evalExpr(re.node.test)) {
              top.reentry = undefined
              top.i++
              continue
            }
            re.phase = 'body'
            const fbody = re.node.body
            if (fbody.type === 'Block' && fbody.body.length === 0) {
              re.phase = 'update' // empty body → straight to update
              return this.idleTick(re.node.startLine, re.node.endLine)
            }
            this.pushBody(fbody)
            continue
          }
          if (re.phase === 'update') {
            if (re.node.update) this.evalExpr(re.node.update)
            re.phase = 'header'
            continue
          }
          // phase 'body' — handled below when sub-cursor exhausts
        }
        if (re.kind === 'block') {
          // sub-cursor handles the body — when it finishes we fall to the next sibling
          top.reentry = undefined
          top.i++
          continue
        }
        if (re.kind === 'if') {
          top.reentry = undefined
          top.i++
          continue
        }
      }

      if (top.i < top.list.length) {
        const stmt = top.list[top.i]!
        // Compound statements transform top into a "reentry" cursor and
        // descend; the actual returned stmt is a simple one inside.
        if (stmt.type === 'Block') {
          this.cursors.push({list: stmt.body, i: 0})
          top.reentry = {kind: 'block', node: stmt}
          continue
        }
        if (stmt.type === 'If') {
          top.reentry = {kind: 'if', node: stmt, branch: 'consequent'}
          const cond = this.evalExpr(stmt.test)
          const next = cond ? stmt.consequent : stmt.alternate
          if (next) {
            this.pushBody(next)
            continue
          }
          top.reentry = undefined
          top.i++
          continue
        }
        if (stmt.type === 'While') {
          top.reentry = {kind: 'while', node: stmt}
          continue
        }
        if (stmt.type === 'For') {
          // Run init once before entering header loop.
          if (stmt.init) {
            if (stmt.init.type === 'VarDecl') this.execVarDecl(stmt.init)
            else this.evalExpr(stmt.init.expr)
          }
          top.reentry = {kind: 'for', node: stmt, phase: 'header'}
          continue
        }
        // Simple statement — return it.
        top.i++
        return stmt
      } else {
        // Cursor exhausted. Pop and let parent advance (or re-enter loop).
        const popped = this.cursors.pop()
        // If the popped cursor was an ISR frame, tell the controller the
        // handler returned. If the user didn't clear the pending bit,
        // intc.finish() warns and the next pickNext() will fire again.
        if (popped?.isr) {
          this.hooks.onLog?.('info', `IRQ #${popped.isr}: returning from handler`)
          this.intc.finish((v) => {
            this.hooks.onLog?.('warn',
              `${v} handler returned without clearing the pending flag — interrupt will re-fire forever on a real chip. Add the clear-flag write before return.`)
          })
        }
        const parent = this.cursors[this.cursors.length - 1]
        if (parent?.reentry?.kind === 'for') {
          parent.reentry.phase = 'update'
        }
      }
    }
    return null
  }

  private pushBody(stmt: Stmt) {
    if (stmt.type === 'Block') this.cursors.push({list: stmt.body, i: 0})
    else this.cursors.push({list: [stmt], i: 0})
  }
  private popUntilStmt(): Stmt | null { return this.nextStmt() }

  /**
   * Synthetic "do nothing" statement that nevertheless counts as one
   * interpreter step. We yield this from inside an empty `while/for`
   * body so the post-step hooks (SysTick tick, interrupt dispatch) get
   * a chance to fire each iteration. Editor highlights the loop header.
   */
  private idleTick(startLine: number, endLine: number): Stmt {
    return {
      type: 'ExprStmt',
      expr: {type: 'Number', value: 0, raw: '0', startLine, endLine},
      startLine, endLine
    }
  }

  // ── statement execution (for simple stmts only) ────────────────────
  private executeStmt(stmt: Stmt, writes: RegisterWrite[], pinChanges: PinChange[]): {log?: string} | void {
    switch (stmt.type) {
      case 'ExprStmt': {
        const out = this.evalExprWithDiff(stmt.expr)
        mergeWrites(writes, out.writes)
        pinChanges.push(...out.pinChanges)
        return {log: out.log}
      }
      case 'VarDecl':
        this.execVarDecl(stmt)
        return
      case 'Break':
        this.bubbleControl('break')
        return
      case 'Continue':
        this.bubbleControl('continue')
        return
      case 'Return':
        if (stmt.value) this.evalExpr(stmt.value)
        // From an ISR: pop just the ISR frame (intc.finish() runs in
        // the cursor-exhausted branch). From main: empty all cursors
        // so the program halts on the next step.
        while (this.cursors.length > 0) {
          const top = this.cursors[this.cursors.length - 1]!
          if (top.isr) {
            // Stop here — the next nextStmt() call will see this cursor
            // exhausted and trigger intc.finish().
            top.i = top.list.length
            return
          }
          this.cursors.pop()
        }
        return
      default:
        throw new RuntimeError(stmt, `unsupported statement type ${(stmt as Stmt).type}`)
    }
  }

  private execVarDecl(stmt: VarDecl) {
    const value = stmt.init ? this.evalExpr(stmt.init) : 0
    this.scope().set(stmt.name, value >>> 0)
  }

  private bubbleControl(kind: 'break' | 'continue') {
    // Pop cursors until we land on a loop. break → also pop the loop.
    while (this.cursors.length > 0) {
      const top = this.cursors[this.cursors.length - 1]!
      const re = top.reentry
      if (re?.kind === 'while' || re?.kind === 'for') {
        if (kind === 'break') {
          top.reentry = undefined
          top.i++
        } else {
          // continue — for/while loop header re-checks naturally
          if (re.kind === 'for') re.phase = 'update'
        }
        return
      }
      this.cursors.pop()
    }
  }

  // ── expressions ────────────────────────────────────────────────────
  /**
   * Pure evaluation — no MMIO writes happen here unless the expression
   * is an Assign. For Assign expressions, prefer evalExprWithDiff().
   */
  private evalExpr(e: Expr): number {
    return this.evalExprWithDiff(e).value
  }

  private evalExprWithDiff(e: Expr): {value: number; writes: RegisterWrite[]; pinChanges: PinChange[]; log?: string} {
    const writes: RegisterWrite[] = []
    const pinChanges: PinChange[] = []
    let log: string | undefined

    const value = this.evalInner(e, writes, pinChanges, (m) => { log = m })
    return {value: value >>> 0, writes, pinChanges, log}
  }

  private evalInner(e: Expr, writes: RegisterWrite[], pinChanges: PinChange[], setLog: (m: string) => void): number {
    switch (e.type) {
      case 'Number': return e.value >>> 0
      case 'Ident':  return this.resolveIdentValue(e, writes, pinChanges, setLog)
      case 'Group':  return this.evalInner(e.expr, writes, pinChanges, setLog)
      case 'Cast':   return this.evalInner(e.expr, writes, pinChanges, setLog)
      case 'Unary': {
        const v = this.evalInner(e.arg, writes, pinChanges, setLog)
        switch (e.op) {
          case '!': return v ? 0 : 1
          case '~': return (~v) >>> 0
          case '-': return (-v) >>> 0
          case '+': return v >>> 0
        }
        return 0
      }
      case 'Binary': {
        // short-circuit operators
        if (e.op === '&&') {
          const l = this.evalInner(e.left, writes, pinChanges, setLog)
          if (!l) return 0
          const r = this.evalInner(e.right, writes, pinChanges, setLog)
          return r ? 1 : 0
        }
        if (e.op === '||') {
          const l = this.evalInner(e.left, writes, pinChanges, setLog)
          if (l) return 1
          const r = this.evalInner(e.right, writes, pinChanges, setLog)
          return r ? 1 : 0
        }
        const l = this.evalInner(e.left, writes, pinChanges, setLog)
        const r = this.evalInner(e.right, writes, pinChanges, setLog)
        switch (e.op) {
          case '+':  return (l +  r) >>> 0
          case '-':  return (l -  r) >>> 0
          case '*':  return Math.imul(l, r) >>> 0
          case '/':  return r === 0 ? 0 : Math.trunc(l / r) >>> 0
          case '%':  return r === 0 ? 0 : (l % r) >>> 0
          case '<<': return (l << (r & 31)) >>> 0
          case '>>': return (l >>> (r & 31)) >>> 0
          case '&':  return (l & r) >>> 0
          case '|':  return (l | r) >>> 0
          case '^':  return (l ^ r) >>> 0
          case '<':  return l <  r ? 1 : 0
          case '<=': return l <= r ? 1 : 0
          case '>':  return l >  r ? 1 : 0
          case '>=': return l >= r ? 1 : 0
          case '==': return l === r ? 1 : 0
          case '!=': return l !== r ? 1 : 0
        }
        return 0
      }
      case 'Ternary': {
        const t = this.evalInner(e.test, writes, pinChanges, setLog)
        return t ? this.evalInner(e.consequent, writes, pinChanges, setLog)
                 : this.evalInner(e.alternate,  writes, pinChanges, setLog)
      }
      case 'Deref': {
        const addr = this.evalInner(e.target, writes, pinChanges, setLog)
        return this.bus.read(addr >>> 0)
      }
      case 'Call':   return this.evalCall(e, writes, pinChanges, setLog)
      case 'Assign': return this.evalAssign(e, writes, pinChanges, setLog)
      case 'Postfix': return this.evalPostfix(e, writes, pinChanges, setLog)
    }
  }

  /**
   * `x++` / `x--` — read current value, write current ± 1, return
   * the ORIGINAL value (C semantics). For `while(cycles--)`, the
   * loop ends one iteration AFTER cycles reaches zero, not when it
   * is decremented to zero.
   */
  private evalPostfix(e: import('./ast').PostfixExpr, writes: RegisterWrite[], pinChanges: PinChange[], setLog: (m: string) => void): number {
    const target = this.resolveAssignTarget(e.target)
    const cur = target.kind === 'local'
      ? this.readLocal(target.name)
      : this.bus.read(target.addr)
    const next = (e.op === '++' ? cur + 1 : cur - 1) >>> 0
    if (target.kind === 'local') {
      this.scope().set(target.name, next)
    } else {
      const out = this.bus.write(target.addr, next)
      mergeWrites(writes, out.writes)
      pinChanges.push(...out.pinChanges)
    }
    return cur >>> 0
  }

  /**
   * Resolve an identifier reference. Local variables win over macros.
   * Macros are evaluated lazily — recursing into evalInner on the
   * macro body.
   */
  private resolveIdentValue(e: Ident, writes: RegisterWrite[], pinChanges: PinChange[], setLog: (m: string) => void): number {
    // Local scope chain
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      const v = this.callStack[i]!.vars
      if (v.has(e.name)) return v.get(e.name)! >>> 0
    }
    const macro = this.macros.get(e.name)
    if (macro) {
      return this.evalInner(macro.body, writes, pinChanges, setLog)
    }
    throw new RuntimeError(e, `unknown identifier '${e.name}'`)
  }

  /**
   * When the LHS of `=` is an Ident, peel macros to find a Deref. If
   * the macro yields a Deref(addressExpr), the assignment becomes an
   * MMIO write. Otherwise it's a local variable binding.
   */
  private resolveAssignTarget(e: Ident | DerefExpr):
    | {kind: 'local'; name: string}
    | {kind: 'mmio'; addr: number}
  {
    if (e.type === 'Deref') {
      const addr = this.evalExpr(e.target)
      return {kind: 'mmio', addr: addr >>> 0}
    }
    const macro = this.macros.get(e.name)
    if (!macro) return {kind: 'local', name: e.name}
    const peeled = peelToDeref(macro.body)
    if (peeled) {
      const addr = this.evalExpr(peeled.target)
      return {kind: 'mmio', addr: addr >>> 0}
    }
    return {kind: 'local', name: e.name}
  }

  private evalAssign(e: AssignExpr, writes: RegisterWrite[], pinChanges: PinChange[], setLog: (m: string) => void): number {
    const target = this.resolveAssignTarget(e.target)
    const rhs = this.evalInner(e.value, writes, pinChanges, setLog)

    let next: number
    if (e.op === '=') next = rhs >>> 0
    else {
      const cur = target.kind === 'local'
        ? this.readLocal(target.name)
        : this.bus.read(target.addr)
      next = applyCompound(cur, rhs, e.op) >>> 0
    }

    if (target.kind === 'local') {
      this.scope().set(target.name, next)
      return next
    }
    const out = this.bus.write(target.addr, next)
    mergeWrites(writes, out.writes)
    pinChanges.push(...out.pinChanges)
    return next
  }

  private readLocal(name: string): number {
    for (let i = this.callStack.length - 1; i >= 0; i--) {
      const v = this.callStack[i]!.vars
      if (v.has(name)) return v.get(name)! >>> 0
    }
    // Uninitialised — treat as 0.
    return 0
  }

  private scope(): Map<string, number> {
    return this.callStack[this.callStack.length - 1]!.vars
  }

  // ── built-in calls ────────────────────────────────────────────────
  private evalCall(e: CallExpr, writes: RegisterWrite[], pinChanges: PinChange[], setLog: (m: string) => void): number {
    const args = e.args.map((a) => this.evalInner(a, writes, pinChanges, setLog))
    switch (e.callee) {
      case 'Delay_Ms':
      case 'Delay_Us':
        this.hooks.onLog?.('warn', `${e.callee}() is a ch32v003fun framework function — this curriculum is bare-metal, so it won't link on real hardware. Replace it with an inline busy-wait (\`for (int i = 0; i < N; i = i + 1) {}\`) or a SysTick-based delay (see the systick-blink preset).`)
        return 0
      case 'main':
        // calling main() recursively is a no-op for v1
        return 0
      default:
        this.hooks.onLog?.('warn', `function ${e.callee}() is defined in your code but the simulator doesn't run user-defined functions yet — call skipped. Inline the body if you need it to execute.`)
        return 0
    }
  }
}

function applyCompound(cur: number, rhs: number, op: AssignExpr['op']): number {
  switch (op) {
    case '=':   return rhs
    case '|=':  return cur | rhs
    case '&=':  return cur & rhs
    case '^=':  return cur ^ rhs
    case '<<=': return cur << (rhs & 31)
    case '>>=': return cur >>> (rhs & 31)
    case '+=':  return cur + rhs
    case '-=':  return cur - rhs
    case '*=':  return Math.imul(cur, rhs)
    case '/=':  return rhs === 0 ? 0 : Math.trunc(cur / rhs)
    case '%=':  return rhs === 0 ? 0 : cur % rhs
  }
}

/** Peel Group / Cast layers around an Expr looking for a Deref. */
function peelToDeref(e: Expr): DerefExpr | null {
  let cur: Expr = e
  while (cur) {
    if (cur.type === 'Deref') return cur as DerefExpr
    if (cur.type === 'Group') { cur = (cur as GroupExpr).expr; continue }
    if (cur.type === 'Cast')  { cur = (cur as CastExpr).expr;  continue }
    return null
  }
  return null
}

function mergeWrites(target: RegisterWrite[], src: RegisterWrite[]) {
  for (const w of src) {
    // Coalesce per-address: if we already saw this register in the
    // same step, keep the original oldValue but bump newValue.
    const prev = target.find((x) => x.address === w.address)
    if (prev) {
      prev.newValue = w.newValue
      prev.bitsFlipped = bitsThatFlipped(prev.oldValue, prev.newValue)
    } else {
      target.push({...w})
    }
  }
}
function bitsThatFlipped(o: number, n: number): number[] {
  const d = (o ^ n) >>> 0
  const out: number[] = []
  for (let i = 0; i < 32; i++) if (d & (1 << i)) out.push(i)
  return out
}
