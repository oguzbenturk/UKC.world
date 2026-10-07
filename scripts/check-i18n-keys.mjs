#!/usr/bin/env node
/**
 * check-i18n-keys.mjs — find translation keys used in src/ that are missing
 * from public/locales/<lang>/<namespace>.json.
 *
 * Usage:
 *   node scripts/check-i18n-keys.mjs            # human-readable report
 *   node scripts/check-i18n-keys.mjs --json     # machine-readable report on stdout
 *   node scripts/check-i18n-keys.mjs --lang=en  # only check one language
 *   node scripts/check-i18n-keys.mjs --verbose  # also list every dynamic key site
 *
 * Exit code: 1 when at least one statically-known key is missing in any checked
 * language, 0 otherwise.
 *
 * What is detected (via an AST parse, not regexes):
 *   - t('ns:key'), t('key') where `t` comes from useTranslation(...) (also
 *     aliased: `const { t: tc } = useTranslation('common')`). An unprefixed key
 *     resolves against the hook's FIRST namespace (react-i18next default
 *     nsMode), useTranslation() → defaultNS 'common'.
 *   - i18n.t('...') / i18next.t('...') → defaultNS 'common' when unprefixed.
 *   - <Trans i18nKey="..."> (honours an `ns` prop).
 *   - t(cond ? 'a' : 'b') → both branches.
 *   - Calls with a defaultValue option or a string 2nd argument are flagged
 *     "has fallback" (still reported as missing — the fallback hides the gap
 *     in English only and is never translated).
 *   - A `count` option means plural variants (key_one/key_other/...) satisfy
 *     the lookup.
 * Keys built at runtime (template literals with ${}, concatenation,
 * variables) cannot be checked; template-literal sites are listed under
 * "dynamic keys".
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'src');
const LOCALES_DIR = path.join(ROOT, 'public', 'locales');
const LANGS = ['en', 'tr', 'de', 'fr', 'es', 'ru'];
const NAMESPACES = ['common', 'errors', 'public', 'outsider', 'student', 'instructor', 'manager', 'admin', 'proposal'];
const DEFAULT_NS = 'common';
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];

// Files that receive `t` as a parameter (no useTranslation hook of their own):
// the namespace their caller's hook uses, for unprefixed keys.
const PARAM_T_NAMESPACES = [
  [/features[\\/]proposals[\\/]/, 'proposal'],
];

const args = process.argv.slice(2);
const AS_JSON = args.includes('--json');
const VERBOSE = args.includes('--verbose');
const langArg = args.find((a) => a.startsWith('--lang='));
const CHECK_LANGS = langArg ? langArg.slice('--lang='.length).split(',') : LANGS;

// ---------------------------------------------------------------- source files
function listSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '__mocks__') continue;
      out.push(...listSourceFiles(full));
    } else if (/\.(jsx?|tsx?|mjs)$/.test(entry.name) && !/\.(test|spec)\.[jt]sx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function parseFile(code, file) {
  const plugins = ['jsx', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator', 'dynamicImport', 'topLevelAwait'];
  if (/\.tsx?$/.test(file)) plugins.push('typescript');
  return parse(code, { sourceType: 'module', plugins, errorRecovery: true, allowReturnOutsideFunction: true });
}

const isFunction = (n) => n && /Function|ArrowFunction|ObjectMethod|ClassMethod/.test(n.type) && n.body;

function walk(node, parents, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parents);
  parents.push(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments' || key === 'extra') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === 'string') walk(child, parents, visit);
    } else if (value && typeof value.type === 'string') {
      walk(value, parents, visit);
    }
  }
  parents.pop();
}

const staticString = (n) => {
  if (!n) return null;
  if (n.type === 'StringLiteral') return n.value;
  if (n.type === 'TemplateLiteral' && n.expressions.length === 0) return n.quasis.map((q) => q.value.cooked).join('');
  return null;
};

function hookNamespaces(call) {
  const arg = call.arguments[0];
  if (!arg) return [DEFAULT_NS];
  const s = staticString(arg);
  if (s) return [s];
  if (arg.type === 'ArrayExpression') {
    const list = arg.elements.map(staticString).filter(Boolean);
    return list.length ? list : [DEFAULT_NS];
  }
  return [DEFAULT_NS];
}

// ---------------------------------------------------------------- extraction
const usages = []; // { key, ns, file, line, fallback, plural }
const dynamicSites = []; // { file, line, expr, kind }

function extractFromFile(file) {
  const code = fs.readFileSync(file, 'utf8');
  if (!/\bt\(|i18nKey|\.t\(/.test(code)) return;
  let ast;
  try {
    ast = parseFile(code, file);
  } catch (err) {
    process.stderr.write(`! could not parse ${path.relative(ROOT, file)}: ${err.message}\n`);
    return;
  }
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');

  // Pass 1: useTranslation hooks → { fn, start, ns, tName }
  const hooks = [];
  walk(ast.program, [], (node, parents) => {
    if (node.type !== 'VariableDeclarator' || !node.init) return;
    let init = node.init;
    if (init.type === 'AwaitExpression') init = init.argument;
    if (init.type !== 'CallExpression' || init.callee.type !== 'Identifier' || init.callee.name !== 'useTranslation') return;
    const ns = hookNamespaces(init);
    const fn = [...parents].reverse().find(isFunction) || null;
    if (node.id.type === 'ObjectPattern') {
      for (const prop of node.id.properties) {
        if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier' && prop.key.name === 't') {
          const local = prop.value.type === 'Identifier' ? prop.value.name : prop.value.left?.name;
          if (local) hooks.push({ fn, start: node.start, ns, tName: local });
        }
      }
    }
  });
  const tNames = new Set(['t', ...hooks.map((h) => h.tName)]);
  const paramNs = PARAM_T_NAMESPACES.find(([re]) => re.test(rel))?.[1];

  const resolveHookNs = (tName, parents, pos) => {
    const sameName = hooks.filter((h) => h.tName === tName);
    for (let i = parents.length - 1; i >= 0; i--) {
      if (!isFunction(parents[i])) continue;
      const own = sameName.find((h) => h.fn === parents[i]);
      if (own) return own.ns;
    }
    const preceding = sameName.filter((h) => h.start < pos).pop();
    if (preceding) return preceding.ns;
    if (sameName.length) return sameName[0].ns;
    if (paramNs) return [paramNs];
    return [DEFAULT_NS];
  };

  const record = (keyNode, nsList, optsNode, line, extraOpts) => {
    if (!keyNode) return;
    if (keyNode.type === 'ConditionalExpression') {
      record(keyNode.consequent, nsList, optsNode, line, extraOpts);
      record(keyNode.alternate, nsList, optsNode, line, extraOpts);
      return;
    }
    if (keyNode.type === 'LogicalExpression') {
      record(keyNode.right, nsList, optsNode, line, extraOpts);
      return;
    }
    const key = staticString(keyNode);
    if (key == null) {
      if (keyNode.type === 'TemplateLiteral') {
        dynamicSites.push({ file: rel, line, kind: 'template', expr: code.slice(keyNode.start, keyNode.end) });
      } else if (VERBOSE) {
        dynamicSites.push({ file: rel, line, kind: keyNode.type, expr: code.slice(keyNode.start, keyNode.end).slice(0, 80) });
      }
      return;
    }
    if (!key.trim()) return;
    let fallback = null;
    let plural = false;
    let optNs = null;
    if (optsNode) {
      const s = staticString(optsNode);
      if (s != null) fallback = s;
      else if (optsNode.type === 'TemplateLiteral') fallback = code.slice(optsNode.start, optsNode.end);
      else if (optsNode.type === 'ObjectExpression') {
        for (const p of optsNode.properties) {
          if (p.type !== 'ObjectProperty') continue;
          const name = p.key.type === 'Identifier' ? p.key.name : p.key.value;
          if (name === 'defaultValue') fallback = staticString(p.value) ?? code.slice(p.value.start, p.value.end);
          if (name === 'count') plural = true;
          if (name === 'ns') optNs = staticString(p.value) ?? (p.value.type === 'ArrayExpression' ? staticString(p.value.elements[0]) : null);
        }
      }
    }
    // t(key, 'default', { count, ns }) — i18next's overload: options in the 3rd argument.
    if (extraOpts?.type === 'ObjectExpression') {
      for (const p of extraOpts.properties) {
        if (p.type !== 'ObjectProperty') continue;
        const name = p.key.type === 'Identifier' ? p.key.name : p.key.value;
        if (name === 'count') plural = true;
        if (name === 'ns') optNs = staticString(p.value) ?? optNs;
      }
    }
    let ns = optNs || nsList[0];
    let k = key;
    const sep = key.indexOf(':');
    if (sep > 0 && !/\s/.test(key.slice(0, sep))) {
      ns = key.slice(0, sep);
      k = key.slice(sep + 1);
    }
    usages.push({ ns, key: k, file: rel, line, fallback, plural });
  };

  // Pass 2: calls and <Trans>
  walk(ast.program, [], (node, parents) => {
    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
      const callee = node.callee;
      let nsList = null;
      if (callee.type === 'Identifier' && tNames.has(callee.name)) {
        nsList = resolveHookNs(callee.name, parents, node.start);
      } else if (
        (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') &&
        callee.object.type === 'Identifier' && /^(i18n|i18next)$/.test(callee.object.name) &&
        callee.property.type === 'Identifier' && callee.property.name === 't'
      ) {
        nsList = [DEFAULT_NS];
      }
      if (nsList) record(node.arguments[0], nsList, node.arguments[1], node.loc.start.line, node.arguments[2]);
      return;
    }
    if (node.type === 'JSXOpeningElement' && node.name.type === 'JSXIdentifier' && node.name.name === 'Trans') {
      const attr = (name) => node.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === name);
      const keyAttr = attr('i18nKey');
      if (!keyAttr || !keyAttr.value) return;
      const value = keyAttr.value.type === 'JSXExpressionContainer' ? keyAttr.value.expression : keyAttr.value;
      const nsAttr = attr('ns');
      const nsValue = nsAttr?.value && (nsAttr.value.type === 'JSXExpressionContainer' ? nsAttr.value.expression : nsAttr.value);
      const explicitNs = nsValue ? staticString(nsValue) : null;
      const nsList = explicitNs ? [explicitNs] : resolveHookNs('t', parents, node.start);
      const defaults = attr('defaults');
      const optsNode = defaults?.value ? { type: 'ObjectExpression', properties: [{ type: 'ObjectProperty', key: { type: 'Identifier', name: 'defaultValue' }, value: defaults.value }] } : null;
      record(value, nsList, optsNode, node.loc.start.line);
    }
  });
}

// ---------------------------------------------------------------- locales
const locales = {};
for (const lang of LANGS) {
  locales[lang] = {};
  for (const ns of NAMESPACES) {
    const file = path.join(LOCALES_DIR, lang, `${ns}.json`);
    try {
      locales[lang][ns] = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if (fs.existsSync(file)) {
        process.stderr.write(`! invalid JSON: ${path.relative(ROOT, file)}: ${err.message}\n`);
        process.exitCode = 1;
      }
      locales[lang][ns] = null;
    }
  }
}

function lookup(obj, key) {
  let cur = obj;
  for (const part of key.split('.')) {
    if (cur == null || typeof cur !== 'object' || !(part in cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function hasKey(lang, ns, key, plural) {
  const data = locales[lang]?.[ns];
  if (!data) return false;
  if (lookup(data, key) !== undefined) return true;
  if (plural) return PLURAL_SUFFIXES.some((s) => lookup(data, key + s) !== undefined);
  return false;
}

// ---------------------------------------------------------------- run
for (const file of listSourceFiles(SRC_DIR)) extractFromFile(file);

// Deduplicate usages per ns:key, keeping every site.
const byKey = new Map();
for (const u of usages) {
  const id = `${u.ns}:${u.key}`;
  if (!byKey.has(id)) byKey.set(id, { ns: u.ns, key: u.key, plural: false, fallback: null, sites: [] });
  const entry = byKey.get(id);
  entry.plural ||= u.plural;
  if (u.fallback != null && entry.fallback == null) entry.fallback = u.fallback;
  entry.sites.push(`${u.file}:${u.line}`);
}

const missing = {}; // lang -> [entry]
for (const lang of CHECK_LANGS) {
  missing[lang] = [];
  for (const entry of byKey.values()) {
    if (!hasKey(lang, entry.ns, entry.key, entry.plural)) missing[lang].push(entry);
  }
}
const unknownNs = [...byKey.values()].filter((e) => !NAMESPACES.includes(e.ns));
const templateSites = dynamicSites.filter((d) => d.kind === 'template');
const totalMissing = Object.values(missing).reduce((n, l) => n + l.length, 0);

if (AS_JSON) {
  process.stdout.write(JSON.stringify({
    keysUsed: byKey.size,
    missing: Object.fromEntries(Object.entries(missing).map(([l, list]) => [l, list.map((e) => ({ id: `${e.ns}:${e.key}`, plural: e.plural, fallback: e.fallback, sites: e.sites }))])),
    unknownNamespaces: unknownNs.map((e) => `${e.ns}:${e.key}`),
    dynamic: dynamicSites,
  }, null, 2) + '\n');
} else {
  const out = [];
  out.push(`i18n key check — ${byKey.size} distinct static keys in src/, languages: ${CHECK_LANGS.join(', ')}`);
  if (unknownNs.length) {
    out.push('', `Keys with an unknown namespace prefix (${unknownNs.length}):`);
    for (const e of unknownNs) out.push(`  ${e.ns}:${e.key}  (${e.sites[0]})`);
  }
  for (const lang of CHECK_LANGS) {
    const list = missing[lang];
    if (!list.length) continue;
    const withFallback = list.filter((e) => e.fallback != null);
    const plain = list.filter((e) => e.fallback == null);
    out.push('', `[${lang}] missing ${list.length} key(s)${withFallback.length ? ` — ${withFallback.length} of them have a fallback` : ''}:`);
    for (const e of plain) out.push(`  ${e.ns}:${e.key}${e.plural ? ' (count)' : ''}  ${e.sites[0]}${e.sites.length > 1 ? ` (+${e.sites.length - 1})` : ''}`);
    if (withFallback.length) {
      out.push(`  -- has fallback (defaultValue / string 2nd arg):`);
      for (const e of withFallback) out.push(`  ${e.ns}:${e.key}${e.plural ? ' (count)' : ''}  ${e.sites[0]}  fallback=${JSON.stringify(e.fallback).slice(0, 60)}`);
    }
  }
  out.push('', `Dynamic keys (template literals, not checked): ${templateSites.length} site(s)`);
  for (const d of (VERBOSE ? dynamicSites : templateSites)) out.push(`  ${d.file}:${d.line}  ${d.expr.replace(/\s+/g, ' ')}`);
  out.push('', 'Summary (missing per language):');
  for (const lang of CHECK_LANGS) {
    const perNs = {};
    for (const e of missing[lang]) perNs[e.ns] = (perNs[e.ns] || 0) + 1;
    const detail = Object.entries(perNs).map(([n, c]) => `${n}=${c}`).join(', ');
    out.push(`  ${lang}: ${missing[lang].length}${detail ? `  (${detail})` : ''}`);
  }
  process.stdout.write(out.join('\n') + '\n');
}

if (totalMissing > 0) process.exitCode = 1;
