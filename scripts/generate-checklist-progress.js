#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const checklistPath = path.resolve(__dirname, '..', 'docs', 'phase-2-remaining-checklist.md');

function parseChecklist(markdown) {
  const lines = markdown.split(/\r?\n/);
  const sections = new Map();
  let currentSection = 'Uncategorized';

  for (const line of lines) {
    if (line.startsWith('## ')) {
      currentSection = line.replace(/^##\s+/, '').trim();
      if (!sections.has(currentSection)) {
        sections.set(currentSection, { done: 0, partial: 0, pending: 0, total: 0 });
      }
      continue;
    }

    const checkboxMatch = line.match(/- \[(x|~| )]/i);
    if (!checkboxMatch) {
      continue;
    }

    if (!sections.has(currentSection)) {
      sections.set(currentSection, { done: 0, partial: 0, pending: 0, total: 0 });
    }

    const status = checkboxMatch[1].toLowerCase();
    const sectionData = sections.get(currentSection);
    sectionData.total += 1;

    switch (status) {
      case 'x':
        sectionData.done += 1;
        break;
      case '~':
        sectionData.partial += 1;
        break;
      default:
        sectionData.pending += 1;
    }
  }

  return sections;
}

function formatPercentage(value, total) {
  if (total === 0) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

function buildReport(sections) {
  const overall = { done: 0, partial: 0, pending: 0, total: 0 };
  const lines = [];

  for (const [section, data] of sections.entries()) {
    if (data.total === 0) continue;

    overall.done += data.done;
    overall.partial += data.partial;
    overall.pending += data.pending;
    overall.total += data.total;

    lines.push({
      section,
      done: data.done,
      partial: data.partial,
      pending: data.pending,
      total: data.total,
      percent: formatPercentage(data.done, data.total)
    });
  }

  const overallPercent = formatPercentage(overall.done, overall.total);

  const tableHeader = ['Section', 'Done', 'Partial', 'Pending', 'Total', 'Completion'];
  const tableRows = lines.map((line) => [
    line.section,
    line.done.toString(),
    line.partial.toString(),
    line.pending.toString(),
    line.total.toString(),
    line.percent
  ]);

  const colWidths = tableHeader.map((header, index) => {
    const contentWidths = tableRows.map((row) => row[index].length);
    return Math.max(header.length, ...contentWidths);
  });

  const formatRow = (row) => row
    .map((cell, index) => cell.padEnd(colWidths[index]))
    .join('  ');

  const output = [];
  output.push(`Checklist path: ${checklistPath}`);
  output.push(`Overall completion: ${overall.done}/${overall.total} (${overallPercent})`);
  output.push('');
  output.push(formatRow(tableHeader));
  output.push(formatRow(colWidths.map((w) => '-'.repeat(w))));
  for (const row of tableRows) {
    output.push(formatRow(row));
  }

  return {
    overall,
    lines,
    text: output.join('\n')
  };
}

function main() {
  const markdown = fs.readFileSync(checklistPath, 'utf-8');
  const sections = parseChecklist(markdown);
  const report = buildReport(sections);
  console.log(report.text);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}

export { parseChecklist, buildReport };
