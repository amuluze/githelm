#!/usr/bin/env node
// 生成 Tauri 条件构建配置 apps/desktop/src-tauri/tauri.ci.conf.json：
//   - 克隆 tauri.release.conf.json
//   - 当未配置 tauri-plugin-updater 时移除 bundle.createUpdaterArtifacts，
//     避免 "plugins > updater doesn't exist" 构建失败。
//
// 用法：node scripts/generate-release-config.mjs [--force-updater] [--force-no-updater]
// 决策优先级：--force 参数 > 环境变量 UPDATER_ENABLED=true/false > 自动检测 Cargo.toml
// CI 的 release.yml 显式传 UPDATER_ENABLED；本地 build:local 走自动检测。

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_SRC = path.join(root, 'apps/desktop/src-tauri/tauri.release.conf.json')
const CONFIG_OUT = path.join(root, 'apps/desktop/src-tauri/tauri.ci.conf.json')
const CARGO_TOML = path.join(root, 'apps/desktop/src-tauri/Cargo.toml')

const args = process.argv.slice(2)
const forceUpdater = args.includes('--force-updater')
const forceNoUpdater = args.includes('--force-no-updater')
if (forceUpdater && forceNoUpdater) {
  console.error('--force-updater 与 --force-no-updater 不能同时使用')
  process.exit(2)
}

/** 自动检测：Cargo.toml 是否声明 tauri-plugin-updater。 */
function detectUpdaterFromCargo() {
  const cargo = readFileSync(CARGO_TOML, 'utf8')
  return /tauri-plugin-updater\b/u.test(cargo)
}

function resolveUpdaterEnabled() {
  if (forceUpdater) return true
  if (forceNoUpdater) return false
  if (process.env.UPDATER_ENABLED !== undefined) {
    return process.env.UPDATER_ENABLED === 'true'
  }
  return detectUpdaterFromCargo()
}

const updaterEnabled = resolveUpdaterEnabled()
const base = JSON.parse(readFileSync(CONFIG_SRC, 'utf8'))
if (!updaterEnabled) {
  delete base.plugins?.updater
  delete base.bundle?.createUpdaterArtifacts
}
writeFileSync(CONFIG_OUT, JSON.stringify(base, null, 2) + '\n')
console.log(
  `Generated ${path.relative(root, CONFIG_OUT)} (updater=${updaterEnabled ? 'enabled' : 'disabled'})`,
)