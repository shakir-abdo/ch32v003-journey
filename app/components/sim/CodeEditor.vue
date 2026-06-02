<script setup lang="ts">
/**
 * CodeMirror 6 wrapper for the playground.
 *
 * Highlights:
 *  - C/C++ syntax via @codemirror/lang-cpp (good fit for our DSL).
 *  - One Dark theme that pairs with the site's cyberpunk palette.
 *  - Active-line marker (driven by props.activeLineRange) shows which
 *    statement the interpreter is currently executing.
 *  - Mounts only on the client (onMounted is client-only in Nuxt SSR);
 *    during SSR the host <div> renders empty.
 */
import {EditorView, lineNumbers, highlightActiveLine, keymap, Decoration, type DecorationSet} from '@codemirror/view'
import {EditorState, StateField, StateEffect, RangeSetBuilder, Compartment} from '@codemirror/state'
import {indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching} from '@codemirror/language'
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands'
import {cpp} from '@codemirror/lang-cpp'
import {oneDark} from '@codemirror/theme-one-dark'

const {t} = useI18n()
const colorMode = useColorMode()

const props = defineProps<{
  modelValue: string
  /** 1-indexed [start, end] line range the interpreter is currently executing. */
  activeLineRange?: [number, number] | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const host = ref<HTMLDivElement | null>(null)
let view: EditorView | null = null

// ─── Active-line decoration via a StateField + StateEffect ──────────
const setActiveRange = StateEffect.define<{from: number; to: number} | null>()

const activeLineField = StateField.define<DecorationSet>({
  create() { return Decoration.none },
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setActiveRange)) {
        if (!e.value) return Decoration.none
        const builder = new RangeSetBuilder<Decoration>()
        const {from, to} = e.value
        // Mark every line in [from..to] as active.
        let pos = from
        while (pos <= to) {
          const line = tr.state.doc.lineAt(pos)
          builder.add(line.from, line.from, Decoration.line({class: 'cm-sim-active-line'}))
          if (line.to >= tr.state.doc.length) break
          pos = line.to + 1
          if (pos > to) break
        }
        return builder.finish()
      }
    }
    return deco.map(tr.changes)
  },
  provide: (f) => EditorView.decorations.from(f)
})

const activeLineTheme = EditorView.theme({
  '.cm-sim-active-line': {
    // Use the cyberpunk primary token so the highlight tracks the
    // active theme (cyan in dark mode, darker cyan in light mode).
    backgroundColor: 'color-mix(in srgb, var(--cy-primary) 14%, transparent)',
    boxShadow: 'inset 3px 0 0 var(--cy-primary)'
  }
})

function applyActiveRange(range: [number, number] | null) {
  if (!view) return
  if (!range) {
    view.dispatch({effects: setActiveRange.of(null)})
    return
  }
  const doc = view.state.doc
  const startLine = Math.min(range[0], doc.lines)
  const endLine   = Math.min(range[1], doc.lines)
  const from = doc.line(startLine).from
  const to   = doc.line(endLine).to
  view.dispatch({effects: setActiveRange.of({from, to})})

  // Scroll the editor's own scroller only — never the page. Using a
  // manual scrollTop adjustment avoids CM6's scrollIntoView, which
  // can scroll ancestor containers and fight the register-panel
  // auto-scroll happening in the same step.
  const scroller = view.scrollDOM
  const block = view.lineBlockAt(from)
  const viewTop = scroller.scrollTop
  const viewBottom = viewTop + scroller.clientHeight
  if (block.top < viewTop || block.bottom > viewBottom) {
    scroller.scrollTop = Math.max(0, block.top - scroller.clientHeight / 3)
  }
}

// Theme is held in a compartment so we can hot-swap dark↔light without
// rebuilding the document state.
const themeCompartment = new Compartment()

function themeExtFor(mode: string) {
  // In dark mode use One Dark; in light mode use CM6's built-in light look
  // (an empty array == no theme override).
  return mode === 'dark' ? oneDark : []
}

function makeState(initial: string): EditorState {
  return EditorState.create({
    doc: initial,
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      bracketMatching(),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, {fallback: true}),
      cpp(),
      themeCompartment.of(themeExtFor(colorMode.value)),
      activeLineField,
      activeLineTheme,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) emit('update:modelValue', u.state.doc.toString())
      })
    ]
  })
}

onMounted(() => {
  if (!host.value) return
  view = new EditorView({state: makeState(props.modelValue), parent: host.value})
  if (props.activeLineRange) applyActiveRange(props.activeLineRange)
})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

// External code prop changes (e.g. preset load) — overwrite the doc.
watch(() => props.modelValue, (next) => {
  if (!view) return
  if (next === view.state.doc.toString()) return
  view.dispatch({
    changes: {from: 0, to: view.state.doc.length, insert: next},
    selection: {anchor: 0}
  })
})

watch(() => props.activeLineRange, (r) => applyActiveRange(r ?? null))

// Hot-swap the theme when the user toggles light/dark mode.
watch(() => colorMode.value, (mode) => {
  if (!view) return
  view.dispatch({effects: themeCompartment.reconfigure(themeExtFor(mode))})
})
</script>

<template>
  <div class="cy-panel flex flex-col h-full" dir="ltr">
    <div class="px-4 py-2 border-b border-[var(--cy-border)] flex items-center justify-between">
      <div class="font-mono text-[10px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
        // {{ t('app.sim.editor.label') }}
      </div>
      <div class="font-mono text-[9px] uppercase tracking-wider text-[var(--cy-fg-muted)]">
        {{ t('app.sim.editor.hint') }}
      </div>
    </div>

    <!-- CM6 mounts into this div on the client; it stays empty during SSR -->
    <div ref="host" class="flex-1 min-h-0 overflow-hidden text-[13px]" />
  </div>
</template>

<style>
/* Make CM6 fill the panel + override OneDark's chrome so the editor blends
   with the cyberpunk panel rather than introducing a lighter slate-grey
   rectangle. */
.cm-editor {
  height: 100%;
  background: var(--cy-card) !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
.cm-editor .cm-scroller,
.cm-editor .cm-content {
  background: var(--cy-card) !important;
}
.cm-editor.cm-focused {
  outline: none;
}
.cm-editor .cm-scroller {
  line-height: 1.55;
}
.cm-editor .cm-gutters {
  background: var(--cy-shell) !important;
  border-right: 1px solid var(--cy-border);
  color: var(--cy-fg-muted);
}
.cm-editor .cm-activeLineGutter,
.cm-editor .cm-activeLine {
  background-color: transparent;
}
.cm-editor .cm-sim-active-line + .cm-activeLine {
  background-color: color-mix(in srgb, var(--cy-primary) 14%, transparent);
}
.cm-editor .cm-sim-active-line .cm-gutterElement,
.cm-editor .cm-sim-active-line.cm-gutterElement {
  color: var(--cy-primary);
  font-weight: 700;
}
</style>
