#!/usr/bin/env node
// static-audit.js — client-v4.js 静态审计 CLI
//
// 【手动运行,不做 CI】SPEC-17 一.6 归档入库:原样搬自验收员工作目录
//   D:/coding/tmp/snx-audit/static-audit.js,除本头部与默认审计路径改相对仓库根外零改动。
//   仓库根 package.json 为 type:module,本目录经 scripts/package.json 声明 type:commonjs
//   保持归档脚本 CJS 原样(require 不改 import)。
//
// 用法(仓库根运行):
//   node scripts/static-audit.js --suite=b1|b2|b3|full [--file=<path>]
//   suite: b1 = vars + emoji
//          b2 = b1 + classes
//          b3 = b2 + confirms
//          full = 全部(= b3)
// 违规 → 打印清单 exit 1;全过 → exit 0。
//
// 检查项:
//   vars    CSS 定义的 --token(--x: 形式) 与全部 var(--x) 引用对账;
//           引用了未定义且无 fallback 的 token 即违规
//   emoji   UI 字符串里的 emoji / 装饰字形(箭头、★✓✗ 等开放集合);
//           豁免:注释行、ICONS 的 svg path 数据、💬 前缀数据标记
//   classes JS className 使用的类名 与 CSS 定义的类名双向对账,孤立项列出;
//           动态拼名等用下方 EXEMPT_CLASSES 豁免
//   confirms 裸 confirm( 调用 >0 即违规(必须走应用内确认)

'use strict'
const fs = require('fs')
const path = require('path')

// ── 豁免名单(classes 检查):动态拼接 / 宿主 DOM 复用的类名,双向豁免 ──
const EXEMPT_CLASSES = [
  // 'on', 'fav', 'chip',   // 示例:往这里加
]

// 默认审计对象:仓库根(= scripts/ 上级)下的 client/client-v4.js,相对仓库根解析、不依赖 CWD
const DEFAULT_FILE = path.resolve(__dirname, '..', 'client', 'client-v4.js')

// emoji / 装饰字形开放集合:箭头、数学符号、技术符、几何形、杂项符号、钉蜂、
// 补充箭头、星形箭头块、变体选择符、全部 emoji 平面
const EMOJI_RE = /[\u2190-\u21FF\u2200-\u22FF\u2300-\u23FF\u25A0-\u25FF\u2600-\u27BF\u2900-\u297F\u2B00-\u2BFF\uFE0F\u{1F000}-\u{1FAFF}]/gu

function parseArgs(argv) {
  let suite = 'full'
  let file = DEFAULT_FILE
  for (const a of argv) {
    const m = /^--suite=(\w+)$/.exec(a)
    if (m) suite = m[1]
    else if (/^--file=(.+)$/.test(a)) file = a.slice('--file='.length)
    else if (/^(b1|b2|b3|full)$/.test(a)) suite = a
  }
  const SUITES = { b1: ['vars', 'emoji'], b2: ['vars', 'emoji', 'classes'], b3: ['vars', 'emoji', 'classes', 'confirms'], full: ['vars', 'emoji', 'classes', 'confirms'] }
  if (!SUITES[suite]) {
    console.error(`unknown suite: ${suite} (b1|b2|b3|full)`)
    process.exit(2)
  }
  return { suite, file, checks: SUITES[suite] }
}

// ── 行号工具 ──
function makeLineLookup(text) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return function lineOf(offset) {
    let lo = 0, hi = starts.length - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1 }
    return lo + 1
  }
}

// ── 提取 css 模板字面量(const css = ` ... `)──
function extractCss(text, lineOf) {
  const marker = text.indexOf('const css = `')
  if (marker < 0) return null
  const bodyStart = marker + 'const css = `'.length
  const end = text.indexOf('\n`', bodyStart)          // 模板以独立一行 ` 结束
  if (end < 0) return null
  return { text: text.slice(bodyStart, end), startLine: lineOf(bodyStart) }
}

// ── 注释行豁免表(含块注释状态机)──
function commentMask(lines) {
  const mask = new Array(lines.length).fill(false)
  let inBlock = false
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (inBlock) { mask[i] = true; if (t.includes('*/')) inBlock = false; continue }
    if (t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) mask[i] = true
    if (t.startsWith('/*') && !t.includes('*/')) inBlock = true
  }
  return mask
}

// ══ check: vars ══
function checkVars(text, lineOf) {
  const problems = []
  const defs = new Map()   // name -> line[]
  const dre = /(?:^|[\s{;])--([a-zA-Z][\w-]*)\s*:/gm
  let m
  while ((m = dre.exec(text))) {
    const ln = lineOf(m.index + m[0].indexOf('--'))
    if (!defs.has(m[1])) defs.set(m[1], [])
    defs.get(m[1]).push(ln)
  }
  const refs = new Map()   // name -> {count, lines[], fallback:boolean}
  const rre = /var\(\s*--([a-zA-Z][\w-]*)\s*(,[^)]*)?\)/g
  while ((m = rre.exec(text))) {
    const name = m[1]
    const hasFallback = m[2] !== undefined
    if (!refs.has(name)) refs.set(name, { count: 0, lines: [], fallback: false })
    const r = refs.get(name)
    r.count++
    if (r.lines.length < 12) r.lines.push(lineOf(m.index))
    if (hasFallback) r.fallback = true
  }
  for (const [name, r] of [...refs].sort()) {
    if (!defs.has(name) && !r.fallback) {
      problems.push({ token: name, count: r.count, lines: [...new Set(r.lines)] })
    }
  }
  return {
    name: 'vars',
    summary: `定义 ${defs.size} 个 token,引用 ${refs.size} 个;未定义且无 fallback 的引用 ${problems.length} 个 token`,
    problems,
  }
}

// ══ check: emoji ══
// 去掉行内注释(/* … */ 与非协议位置的 // …),注释内容不参与扫描
function stripInlineComment(line) {
  let s = line.replace(/\/\*[^]*?\*\//g, (mm) => ' '.repeat(mm.length))
  const idx = s.indexOf('//')
  if (idx > 0 && /\s/.test(s[idx - 1]) && s[idx - 2] !== ':') s = s.slice(0, idx)
  else if (idx === 0) s = ''
  return s
}

function checkEmoji(lines, mask) {
  const problems = []
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) continue
    if (/\bconst ICONS\s*=/.test(lines[i])) continue   // ICONS svg path 数据整行豁免
    const line = stripInlineComment(lines[i]).replace(/💬\s*/g, '')   // 💬 前缀数据标记豁免
    const chars = new Set()
    let m
    EMOJI_RE.lastIndex = 0
    while ((m = EMOJI_RE.exec(line))) chars.add(m[0])
    if (!chars.size) continue
    const excerpt = line.trim().replace(/\s+/g, ' ').slice(0, 90)
    problems.push({ line: i + 1, chars: [...chars].join(' '), excerpt })
  }
  return {
    name: 'emoji',
    summary: `${problems.length} 行 UI 字符串含 emoji/装饰字形`,
    problems,
  }
}

// ══ check: classes ══
function extractCssClasses(css, lineOf) {
  const map = new Map()
  if (!css) return map
  // 注释挖空但保留换行,行号映射才不错位
  const bare = css.text.replace(/\/\*[\s\S]*?\*\//g, (mm) => mm.replace(/[^\n]/g, ' '))
  const re = /\.([a-zA-Z][\w-]+)(?![\w-])/g   // ≥2 字符,与 JS 侧 token 规则对称(单字符类名两侧都不收)
  let m
  while ((m = re.exec(bare))) {
    const name = m[1]
    if (!map.has(name)) map.set(name, [])
    if (map.get(name).length < 6) map.get(name).push(css.startLine + bare.slice(0, m.index).split('\n').length - 1)
  }
  return map
}

function extractJsClasses(text, lineOf) {
  const map = new Map()
  const add = (name, ln) => {
    if (!map.has(name)) map.set(name, [])
    if (map.get(name).length < 6) map.get(name).push(ln)
  }
  const re = /className\s*:/g
  let m
  while ((m = re.exec(text))) {
    // 捕获 className 的值表达式:到深度 0 的 `,` 或 `}` 为止(引号/括号配对感知)
    let i = m.index + m[0].length
    let depth = 0, quote = null, j = i
    for (; j < text.length; j++) {
      const c = text[j]
      if (quote) {
        if (c === '\\') { j++; continue }
        if (c === quote) quote = null
        continue
      }
      if (c === "'" || c === '"' || c === '`') { quote = c; continue }
      if (c === '(' || c === '[' || c === '{') depth++
      else if (c === ')') depth--
      else if (c === ']') depth--
      else if (c === '}') { if (depth === 0) break; depth-- }
      else if (c === ',' && depth === 0) break
    }
    const expr = text.slice(i, j)
      // 比较运算符旁边的字符串是操作数不是类名:挖掉再做字面量提取
      .replace(/(?:===|==|!==|!=)\s*(['"])(?:[^'\\]|\\.)*?\1/g, (mm) => ' '.repeat(mm.length))
      .replace(/(['"])(?:[^'\\]|\\.)*?\1\s*(?:===|==|!==|!=)/g, (mm) => ' '.repeat(mm.length))
    const sre = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g
    let s
    while ((s = sre.exec(expr))) {
      const content = String(s[1] ?? s[2] ?? s[3] ?? '').replace(/\$\{[^}]*\}/g, ' ')
      for (const tok of content.split(/\s+/)) {
        if (/^[a-zA-Z][\w-]+$/.test(tok)) add(tok, lineOf(m.index))   // ≥2 字符
      }
    }
  }
  return map
}

function checkClasses(text, css, lineOf) {
  const cssCls = extractCssClasses(css, lineOf)
  const jsCls = extractJsClasses(text, lineOf)
  const ex = new Set(EXEMPT_CLASSES)
  const jsOnly = [...jsCls.keys()].filter((n) => !cssCls.has(n) && !ex.has(n)).sort()
  const cssOnly = [...cssCls.keys()].filter((n) => !jsCls.has(n) && !ex.has(n)).sort()
  const fmt = (names, src) => names.map((n) => {
    const lines = (src.get(n) || []).slice(0, 4)
    return `  .${n}${lines.length ? '  L' + lines.join(',L') : ''}`
  })
  return {
    name: 'classes',
    summary: `JS 用了 ${jsCls.size} 个类名,CSS 定义 ${cssCls.size} 个;` +
      `JS 孤儿(JS 用了 CSS 没定义)${jsOnly.length} 个,CSS 孤儿(CSS 定义了 JS 没用)${cssOnly.length} 个` +
      (ex.size ? `;EXEMPT 豁免 ${ex.size} 个` : ''),
    problems: [
      ...fmt(jsOnly, jsCls).map((s) => ({ kind: 'js-orphan', s })),
      ...fmt(cssOnly, cssCls).map((s) => ({ kind: 'css-orphan', s })),
    ],
    jsOnly, cssOnly,
  }
}

// ══ check: confirms ══
function checkConfirms(text, lineOf) {
  const problems = []
  const re = /(^|[^\w.$])confirm\s*\(/g
  let m
  while ((m = re.exec(text))) {
    problems.push({ line: lineOf(m.index + m[1].length), excerpt: text.slice(m.index, m.index + 80).split('\n')[0].trim().slice(0, 80) })
  }
  return {
    name: 'confirms',
    summary: `裸 confirm( 调用 ${problems.length} 处(>0 即违规,必须走应用内确认)`,
    problems,
  }
}

// ══ main ══
function main() {
  const { suite, file, checks } = parseArgs(process.argv.slice(2))
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (e) {
    console.error(`cannot read ${file}: ${e.message}`)
    process.exit(2)
  }
  const lines = text.split('\n')
  const lineOf = makeLineLookup(text)
  const css = extractCss(text, lineOf)
  const mask = commentMask(lines)

  console.log('== snx static-audit ==')
  console.log(`file : ${file} (${lines.length} 行)`)
  console.log(`suite: ${suite} → ${checks.join(', ')}`)
  if (!css) console.log('warn : 未找到 const css 模板字面量,classes 检查将失真')

  const results = []
  let violations = 0
  for (const name of checks) {
    let r
    if (name === 'vars') r = checkVars(text, lineOf)
    else if (name === 'emoji') r = checkEmoji(lines, mask)
    else if (name === 'classes') r = checkClasses(text, css, lineOf)
    else if (name === 'confirms') r = checkConfirms(text, lineOf)
    results.push(r)
    const n = r.problems.length
    console.log(`\n[${r.name}] ${n ? `✗ ${r.summary}` : `✓ ${r.summary}`}`)
    for (const p of r.problems.slice(0, 40)) {
      violations++
      if (name === 'vars') console.log(`  var(--${p.token})  ×${p.count}  L${p.lines.join(',L')}`)
      else if (name === 'emoji') console.log(`  L${p.line}  [${p.chars}]  ${p.excerpt}`)
      else if (name === 'classes') console.log(`  ${p.kind}  ${p.s}`)
      else if (name === 'confirms') console.log(`  L${p.line}  ${p.excerpt}`)
    }
    if (r.problems.length > 40) {
      violations += r.problems.length - 40
      console.log(`  …(另 ${r.problems.length - 40} 条省略,共 ${r.problems.length} 条)`)
    }
  }

  console.log(`\nRESULT: ${violations ? 'FAIL' : 'PASS'} — ${violations} 条违规(${checks.join(' + ')})`)
  process.exit(violations ? 1 : 0)
}

main()
