#!/usr/bin/env node
// Keep a Changelog 风格 CHANGELOG.md 的 release notes 提取/校验工具。
// 用法：
//   node scripts/changelog.mjs extract --tag v0.1.0 --changelog CHANGELOG.md [--output release-notes.md]
//   node scripts/changelog.mjs validate --tag v0.1.0 --changelog CHANGELOG.md

import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

/** 从标题行解析版本号："## [0.1.0] - 未发布" → "0.1.0"。 */
export function parseVersionFromHeading(line) {
  const match = line.match(/^##\s*\[([^\]]+)\]/);
  return match ? match[1] : null;
}

/**
 * 提取指定 tag 的 release notes 正文。
 * 定位 "## [<version>]" 分节，采集到下一个 "## " 分节前；返回 trim 后的正文。
 * 条目不存在或正文为空时返回 null。
 */
export function extractReleaseNotes({ tag, changelog }) {
  const version = tag.replace(/^v/, "");
  const content = readFileSync(changelog, "utf8");
  const lines = content.split("\n");
  let inSection = false;
  const captured = [];
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      if (inSection)
        break;
      if (parseVersionFromHeading(line) === version) {
        inSection = true;
        continue;
      }
    }
    if (inSection)
      captured.push(line);
  }
  if (!inSection)
    return null;
  const text = captured.join("\n").trim();
  return text.length > 0 ? text : null;
}

/** 校验 tag 在 CHANGELOG 中存在且非空。 */
export function validateReleaseNotes({ tag, changelog }) {
  return extractReleaseNotes({ tag, changelog }) !== null;
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const options = { tag: null, changelog: "CHANGELOG.md", output: null };
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case "--tag":
        options.tag = args[++i];
        break;
      case "--changelog":
        options.changelog = args[++i];
        break;
      case "--output":
        options.output = args[++i];
        break;
      default:
        console.error(`unknown argument: ${args[i]}`);
        process.exit(2);
    }
  }
  if (!options.tag) {
    console.error(
      "usage: node scripts/changelog.mjs <extract|validate> --tag vX.Y.Z [--changelog CHANGELOG.md] [--output <file>]",
    );
    process.exit(2);
  }

  if (command === "validate") {
    const ok = validateReleaseNotes(options);
    if (!ok) {
      console.error(`release notes missing or empty for tag ${options.tag}`);
      process.exit(1);
    }
    console.log(`release notes OK: ${options.tag}`);
    return;
  }

  if (command === "extract") {
    const text = extractReleaseNotes(options);
    if (text === null) {
      console.error(`release notes missing or empty for tag ${options.tag}`);
      process.exit(1);
    }
    if (options.output) {
      writeFileSync(options.output, `${text}\n`);
      console.log(`wrote ${options.output}`);
    }
    else {
      process.stdout.write(`${text}\n`);
    }
    return;
  }

  console.error(`unknown command: ${command}`);
  process.exit(2);
}

const isMain
  = import.meta.url === `file://${process.argv[1]}`
    || import.meta.url.endsWith(process.argv[1]);
if (isMain)
  main();
