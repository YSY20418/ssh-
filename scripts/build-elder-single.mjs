/**
 * 把适老挂号页打包成「单文件 HTML」。
 *
 * 为什么需要它：
 *   外链的 .js / .css 没有 <meta charset> 可用，编码只能靠 HTTP 响应头或文件 BOM 判断。
 *   桌面浏览器默认按 UTF-8 解析所以没事；部分手机浏览器（国产内核、老 WebView）会按
 *   系统默认编码（GBK）去解外链脚本，页面里的中文文案就会全部乱码。
 *   把样式与脚本内联进 HTML，页面编码就只由 <meta charset> 决定 —— 这一条手机端一定认。
 *
 * 用法：node scripts/build-elder-single.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = path.join(ROOT, 'public', 'elder');
const BOM = '\uFEFF';

function readText(file) {
  // utf-8-sig：自动吃掉 BOM，避免内联时把 BOM 带进正文
  let s = fs.readFileSync(file, 'utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/\r\n/g, '\n');
}

function inlineCss(file) {
  let css = readText(file);
  // @charset 只在样式表最前面才合法，内联后一律剥离：编码已由 HTML 的 <meta charset> 决定
  css = css.replace(/^@charset\s+["'][^"']+["']\s*;?\s*/i, '');
  // 防止提前闭合 <style>
  css = css.replace(/<\/style>/gi, '<\\/style>');
  return css.trim();
}

function inlineJs(file) {
  let js = readText(file);
  // 防止字符串里的 </script> 提前闭合标签
  js = js.replace(/<\/script>/gi, '<\\/script>');
  // 防止 <!-- 被当成 HTML 注释起始
  js = js.replace(/<!--/g, '<\\!--');
  return js.trim();
}

function build() {
  let html = readText(path.join(SRC, 'index.html'));

  const linkRe = /<link\s+rel="stylesheet"\s+href="([^"]+)"[^>]*>/gi;
  html = html.replace(linkRe, (_m, href) => {
    const file = path.join(SRC, href);
    if (!fs.existsSync(file)) throw new Error(`找不到样式文件：${href}`);
    return `<style>\n${inlineCss(file)}\n</style>`;
  });

  const scriptRe = /<script\s+src="([^"]+)"[^>]*>\s*<\/script>/gi;
  html = html.replace(scriptRe, (_m, src) => {
    const file = path.join(SRC, src);
    if (!fs.existsSync(file)) throw new Error(`找不到脚本文件：${src}`);
    return `<script>\n${inlineJs(file)}\n</script>`;
  });

  if (/<link\s+rel="stylesheet"/i.test(html)) throw new Error('仍有未内联的样式外链');
  if (/<script\s+src=/i.test(html)) throw new Error('仍有未内联的脚本外链');

  // 标注这是单文件版，便于人工分辨
  html = html.replace(
    '<meta charset="utf-8">',
    '<meta charset="utf-8">\n<!-- 单文件版：样式与脚本已内联，可单独上传或传到手机直接打开 -->'
  );

  // 输出带 BOM：即便托管方不返回 charset 响应头，浏览器也能靠 BOM 认出 UTF-8
  return BOM + html;
}

const single = build();

const targets = [
  path.join(ROOT, 'public', 'elder', 'standalone.html'),
  path.join(ROOT, '..', 'elder-appointment', 'index.html'),
];

for (const t of targets) {
  fs.mkdirSync(path.dirname(t), { recursive: true });
  fs.writeFileSync(t, single, 'utf8');
}

const kb = (Buffer.byteLength(single, 'utf8') / 1024).toFixed(0);
console.log(`单文件版已生成（${kb} KB，样式与脚本全部内联）`);
for (const t of targets) console.log('  →', path.relative(ROOT, t));
