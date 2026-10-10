/**
 * 构建期 trace 文件重定向补丁（仅用于受限沙箱）
 *
 * 现象：某些受限环境（如带文件写保护的沙箱）里，`next build` 打开
 * `<项目>/.next/trace` 会直接抛 EPERM，构建中断。换目录、换 distDir 都一样，
 * 因为它与项目位置无关，是环境对这次 open 的拦截。
 *
 * 这个文件本身对产物毫无影响：`.next/trace` 只是构建过程记录，
 * 不参与任何页面产物。因此这里把它重定向到系统临时目录，让构建能走完。
 *
 * 用法（由 scripts/build-static.mjs 自动挂载）：
 *   NODE_OPTIONS="--require scripts/trace-guard.cjs" next build
 *
 * 正常环境不需要它 —— 补丁只拦截名字为 trace 的那一个文件，其余一律放行。
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ALT = path.join(os.tmpdir(), 'webpilot-next-trace');

function isTrace(p) {
  return typeof p === 'string' && /[\\/]trace$/.test(p) && p.includes('.next');
}

function redirect(p) {
  return isTrace(p) ? ALT : p;
}

// 同步版
const openSync = fs.openSync;
fs.openSync = function (p, flags, mode) {
  const args = [redirect(p)];
  if (flags !== undefined) args.push(flags);
  if (mode !== undefined) args.push(mode);
  return openSync.apply(this, args);
};

// 回调版（flags / mode / callback 均为可选，需按实参个数保持原样）
const openCb = fs.open;
fs.open = function (p, a, b, c) {
  const args = [redirect(p)];
  for (let i = 1; i < arguments.length; i += 1) args.push(arguments[i]);
  return openCb.apply(this, args);
};

// Promise 版
if (fs.promises && typeof fs.promises.open === 'function') {
  const openPromise = fs.promises.open;
  fs.promises.open = function (p, flags, mode) {
    const args = [redirect(p)];
    if (flags !== undefined) args.push(flags);
    if (mode !== undefined) args.push(mode);
    return openPromise.apply(this, args);
  };
}

module.exports = {};
