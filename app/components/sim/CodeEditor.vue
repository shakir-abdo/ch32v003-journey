<script setup lang="ts">
/**
 * CodeMirror 6 wrapper for the playground.
 *
 * Highlights:
 *  - C/C++ syntax via @codemirror/lang-cpp (good fit for our DSL).
 *  - One Dark theme that pairs with the site's cyberpunk palette.
 *  - Active-line marker (driven by props.activeLineRange) shows which
 *    statement the interpreter is currently executing.
 *  - Renders only on the client (ClientOnly wrapper); SSR keeps the
 *    initial textarea so the page is still usable before hydration.
 */
import {EditorView, lineNumbers, highlightActiveLine, keymap, Decoration, type DecorationSet} from '@codemirror/view'
import {EditorState, StateField, StateEffect, RangeSetBuilder} from '@codemirror/state'
import {indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching} from '@codemirror/language'
import {defaultKeymap, history, historyKeymap} from '@codemirror/commands'
import {cpp} from '@codemirror/lang-cpp'
import {oneDark} from '@codemirror/theme-one-dark'

const {t} = useI18n()

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
    backgroundColor: 'rgba(0, 240, 255, 0.10)',
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

  // Scroll the active range into view if it's offscreen.
  view.dispatch({effects: EditorView.scrollIntoView(from, {y: 'center'})})
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
      oneDark,
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

    <ClientOnly>
      <div ref="host" class="flex-1 min-h-0 overflow-hidden text-[13px]" />
      <template #fallback>
        <textarea
          :value="modelValue"
          spellcheck="false"
          class="flex-1 w-full p-3 bg-transparent font-mono text-[12px] leading-relaxed text-[var(--cy-fg)] resize-none focus:outline-none"
          readonly
        />
      </template>
    </ClientOnly>
  </div>
</template>

<style>
/* Make CM6 fill the panel + dim its default chrome to match the cyberpunk theme. */
.cm-editor {
  height: 100%;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
.cm-editor.cm-focused {
  outline: none;
}
.cm-editor .cm-scroller {
  line-height: 1.55;
}
.cm-editor .cm-gutters {
  background: var(--cy-shell);
  border-right: 1px solid var(--cy-border);
  color: var(--cy-fg-muted);
}
.cm-editor .cm-activeLineGutter,
.cm-editor .cm-activeLine {
  background-color: transparent;
}
.cm-editor .cm-sim-active-line + .cm-activeLine {
  background-color: rgba(0, 240, 255, 0.10);
}
.cm-editor .cm-sim-active-line .cm-gutterElement,
.cm-editor .cm-sim-active-line.cm-gutterElement {
  color: var(--cy-primary);
  font-weight: 700;
}
</style>
