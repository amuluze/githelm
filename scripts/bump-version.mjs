#!/usr/bin/env node
// 版本号 bump 脚本：把分散在多处的版本号一次性同步更新，并在 CHANGELOG 顶部插入新版本分节。
// 纯 Node 实现（无第三方依赖）。
//
// 用法：
//   node scripts/bump-version.mjs 0.1.1              # 显式指定新版本
//   node scripts/bump-version.mjs --patch|--minor|--major   # 自动递增
//   node scripts/bump-version.mjs --check            # 只校验各处一致，不修改
//   node scripts/bump-version.mjs 0.1.1 --dry-run    # 预览改动不写盘
//
// 版本号权威来源：根 package.json 的 version。其余位置必须与之一致。

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const resolve = (rel) => path.join(root, rel)

const PACKAGE_JSON = 'package.json'
const DESKTOP_PACKAGE_JSON = 'apps/desktop/package.json'
const TAURI_CONFIG = 'apps/desktop/src-tauri/tauri.conf.json'
const CARGO_TOML = 'apps/desktop/src-tauri/Cargo.toml'
const CARGO_LOCK = 'apps/desktop/src-tauri/Cargo.lock'
const CHANGELOG = 'CHANGELOG.md'

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/
// Cargo.toml 中 [package] 段内行首 version 字段。
const CARGO_TOML_VERSION_RE = /^version\s*=\s*"([^"]+)"/mu
// Cargo.lock 中 crate 名为 githelm-desktop 的 package 段（crate 名唯一，正则精确命中）。
const CARGO_LOCK_RE = /(\[\[package\]\]\nname = "githelm-desktop"\nversion = )"([^"]*)"/

/** 本地日期 YYYY-MM-DD。 */
function today() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function readJson(rel) {
  return JSON.parse(readFileSync(resolve(rel), 'utf8'))
}

function writeJson(rel, value) {
  writeFileSync(resolve(rel), `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * 收集全部版本号位置。pnpm-lock.yaml 不持有 workspace 顶层版本（仅锁依赖图），
 * 因此本脚本不解析 lockfile；包元数据从 package.json 单一来源读出。
 */
function collectVersions() {
  const pkg = readJson(PACKAGE_JSON)
  const desktop = readJson(DESKTOP_PACKAGE_JSON)
  const tauri = readJson(TAURI_CONFIG)
  const cargoToml = readFileSync(resolve(CARGO_TOML), 'utf8')
  const cargoLock = readFileSync(resolve(CARGO_LOCK), 'utf8')

  return [
    { label: 'package.json', rel: PACKAGE_JSON, value: pkg.version },
    { label: 'apps/desktop/package.json', rel: DESKTOP_PACKAGE_JSON, value: desktop.version },
    { label: 'tauri.conf.json', rel: TAURI_CONFIG, value: tauri.version },
    { label: 'Cargo.toml', rel: CARGO_TOML, value: cargoToml.match(CARGO_TOML_VERSION_RE)?.[1] },
    { label: 'Cargo.lock (githelm-desktop)', rel: CARGO_LOCK, value: cargoLock.match(CARGO_LOCK_RE)?.[2] },
  ]
}

function checkConsistency() {
  const versions = collectVersions()
  const missing = versions.filter((entry) => entry.value === undefined)
  const values = new Set(versions.map((entry) => entry.value))
  const current = versions[0].value
  return {
    ok: missing.length === 0 && values.size === 1,
    current,
    versions,
    missing,
  }
}

function buildVersionWrites(newVersion) {
  const pkg = readJson(PACKAGE_JSON)
  const desktop = readJson(DESKTOP_PACKAGE_JSON)
  const tauri = readJson(TAURI_CONFIG)
  const cargoToml = readFileSync(resolve(CARGO_TOML), 'utf8')
  const cargoLock = readFileSync(resolve(CARGO_LOCK), 'utf8')

  pkg.version = newVersion
  desktop.version = newVersion
  tauri.version = newVersion
  const nextCargoToml = cargoToml.replace(CARGO_TOML_VERSION_RE, `version = "${newVersion}"`)
  const nextCargoLock = cargoLock.replace(CARGO_LOCK_RE, (_m, prefix) => `${prefix}"${newVersion}"`)

  return [
    { label: PACKAGE_JSON, write: () => writeJson(PACKAGE_JSON, pkg) },
    { label: DESKTOP_PACKAGE_JSON, write: () => writeJson(DESKTOP_PACKAGE_JSON, desktop) },
    { label: TAURI_CONFIG, write: () => writeJson(TAURI_CONFIG, tauri) },
    { label: CARGO_TOML, write: () => writeFileSync(resolve(CARGO_TOML), nextCargoToml) },
    { label: CARGO_LOCK, write: () => writeFileSync(resolve(CARGO_LOCK), nextCargoLock) },
  ]
}

/**
 * 更新 CHANGELOG：把旧版本「未发布」分节补上发布日期，并在顶部插入新版本空骨架。
 */
function buildChangelogWrite(oldVersion, newVersion) {
  const content = readFileSync(resolve(CHANGELOG), 'utf8')
  let next = content
  const unreleased = `## [${oldVersion}] - 未发布`
  if (next.includes(unreleased)) {
    next = next.replace(unreleased, `## [${oldVersion}] - ${today()}`)
  }
  const skeleton = [
    `## [${newVersion}] - 未发布`,
    '',
    '### Added',
    '',
    '### Changed',
    '',
    '### Fixed',
    '',
    '### Security',
    '',
  ].join('\n')
  const headingIndex = next.search(/\n## \[/)
  if (headingIndex === -1) {
    throw new Error('CHANGELOG.md 缺少版本分节标题（## [x.y.z]）')
  }
  next = `${next.slice(0, headingIndex)}\n${skeleton}\n${next.slice(headingIndex)}`
  return { label: CHANGELOG, next }
}

function usage() {
  console.error(
    'usage: node scripts/bump-version.mjs <x.y.z> | --patch|--minor|--major [--dry-run] | --check',
  )
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function main() {
  const args = process.argv.slice(2)
  const flags = new Set(args.filter((arg) => arg.startsWith('--')))
  const positional = args.filter((arg) => !arg.startsWith('--'))
  const checkOnly = flags.has('--check')
  const dryRun = flags.has('--dry-run')
  const bumpType = ['--patch', '--minor', '--major'].find((flag) => flags.has(flag))

  if (checkOnly) {
    if (positional.length > 0 || bumpType) {
      usage()
      process.exit(2)
    }
    const { ok, current, versions, missing } = checkConsistency()
    for (const entry of versions) {
      console.log(`${entry.value ?? '<missing>'}  ${entry.label}`)
    }
    if (missing.length > 0) {
      fail(`版本号解析失败：${missing.map((entry) => entry.label).join(', ')}`)
    }
    if (!ok) {
      fail(`版本号不一致：以 package.json 的 ${current} 为准，请检查以上清单`)
    }
    console.log(`版本号一致：${current}`)
    process.exit(0)
  }

  const current = checkConsistency().current
  if (!current) fail('无法从 package.json 读取当前版本号')
  const currentMatch = current.match(SEMVER)
  if (!currentMatch) fail(`当前版本 ${current} 不是纯 semver（x.y.z），无法自动递增`)

  let newVersion
  if (positional.length === 1 && SEMVER.test(positional[0]) && !bumpType) {
    newVersion = positional[0]
  } else if (bumpType && positional.length === 0) {
    const [, major, minor, patch] = currentMatch.map(Number)
    if (bumpType === '--major') newVersion = `${major + 1}.0.0`
    else if (bumpType === '--minor') newVersion = `${major}.${minor + 1}.0`
    else newVersion = `${major}.${minor}.${patch + 1}`
  } else {
    usage()
    process.exit(2)
  }

  if (newVersion === current) fail(`新版本 ${newVersion} 与当前版本相同，无需 bump`)

  // bump 前先校验一致，避免在脏状态下覆盖。
  const before = checkConsistency()
  if (!before.ok) fail(`bump 前版本号不一致（当前 ${before.current}），请先修正再 bump`)

  const versionWrites = buildVersionWrites(newVersion)
  const changelogWrite = buildChangelogWrite(current, newVersion)

  if (dryRun) {
    console.log(`[dry-run] ${current} → ${newVersion}`)
    for (const entry of versionWrites) console.log(`  更新 ${entry.label}`)
    console.log(`  更新 ${changelogWrite.label}（插入 ## [${newVersion}] - 未发布）`)
    console.log('未写盘（--dry-run）')
    process.exit(0)
  }

  for (const entry of versionWrites) entry.write()
  writeFileSync(resolve(CHANGELOG), changelogWrite.next)

  const after = checkConsistency()
  if (!after.ok || after.current !== newVersion) {
    fail(`bump 后自检失败：期望 ${newVersion}，实际 ${after.current}`)
  }
  console.log(`版本号已 bump：${current} → ${newVersion}`)
  console.log(`CHANGELOG 已插入 ## [${newVersion}] - 未发布 分节`)
}

main()