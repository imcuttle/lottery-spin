#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { config as loadDotenv } from 'dotenv';
import open from 'open';
import { resolveConfig } from '../server/src/config.js';
import { startServer } from '../server/src/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const HELP = `
🎰 lottery-spin — 目录文件老虎机抽奖

用法:
  lottery-spin [选项]

选项:
  -d, --dir <path>      抽奖文件目录, 可重复指定多个或逗号分隔 (默认: 当前目录)
                        例: -d ./a -d ./b   或   -d ./a,./b
  -t, --type <list>     文件类型预设, 可重复或逗号分隔
                        可选: image, video, audio, text, doc
                        例: -t image,video
  -e, --ext <list>      自定义文件后缀, 逗号分隔 (与 --type 取并集)
                        例: -e jpg,png,mp4
  -a, --awards <n>      抽奖个数, 从低奖到高奖依次抽出 (默认: 3)
  -p, --port <n>        服务端口 (默认: 8787)
      --no-open         启动后不自动打开浏览器
  -h, --help            显示帮助
  -v, --version         显示版本

后缀确定方式: --type 预设 与 --ext 自定义后缀取并集;
两者都不指定时默认预设 图片 + 视频 + 文本。

配置优先级: 命令行参数 > 环境变量 > 默认值
环境变量可写在运行目录的 .env / .env.local 中:
  LOTTERY_DIR (逗号分隔多目录), LOTTERY_TYPES, LOTTERY_EXTENSIONS, AWARD_COUNT, PORT

示例:
  cd ~/photos && lottery-spin -t image -a 3
  lottery-spin --type image,video --dir ./prizes
  lottery-spin -t doc -e zip,rar
  lottery-spin -d ./gold -d ./silver -d ./bronze
`;

function parseArgs(argv) {
  const out = { open: true };
  const aliases = {
    '-d': 'dir', '--dir': 'dir',
    '-t': 'type', '--type': 'type',
    '-e': 'ext', '--ext': 'ext',
    '-a': 'awards', '--awards': 'awards',
    '-p': 'port', '--port': 'port',
  };
  // --dir / --type 可重复指定，累积成数组
  const multi = new Set(['dir', 'type']);
  const setVal = (key, val) => {
    if (multi.has(key)) {
      out[key] = out[key] ? [].concat(out[key], val) : val;
    } else {
      out[key] = val;
    }
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') { out.help = true; continue; }
    if (arg === '-v' || arg === '--version') { out.version = true; continue; }
    if (arg === '--no-open') { out.open = false; continue; }
    const key = aliases[arg];
    if (key) { setVal(key, argv[++i]); continue; }
    // 支持 --key=value
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m && aliases[`--${m[1]}`]) { setVal(aliases[`--${m[1]}`], m[2]); }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) { process.stdout.write(HELP); return; }
  if (args.version) { process.stdout.write(`${pkg.version}\n`); return; }

  const cwd = process.cwd();
  // 从运行目录加载 .env / .env.local（.env.local 优先级更高）
  loadDotenv({ path: path.join(cwd, '.env') });
  loadDotenv({ path: path.join(cwd, '.env.local'), override: true });

  const config = resolveConfig(args, cwd);

  // 启动前校验目录：全部不存在才报错退出，部分缺失只警告
  const missing = config.lotteryDirs.filter((d) => !fs.existsSync(d));
  if (missing.length === config.lotteryDirs.length) {
    console.error(`\n✖ 抽奖目录不存在: ${missing.join(', ')}\n`);
    process.exit(1);
  }
  if (missing.length > 0) {
    console.warn(`⚠ 以下目录不存在，已跳过: ${missing.join(', ')}`);
  }

  let server;
  try {
    server = await startServer(config);
  } catch (err) {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`\n✖ 端口 ${config.port} 已被占用，请用 --port 指定其他端口\n`);
    } else {
      console.error('\n✖ 启动失败:', err);
    }
    process.exit(1);
  }

  const dirsLabel = config.lotteryDirs
    .map((d) => path.relative(cwd, d) || d)
    .join('\n           ');
  console.log(`
🎰 澳门老虎机抽奖已启动
   地址:   ${server.url}
   目录:   ${dirsLabel}
   类型:   ${config.types.length ? config.types.join(', ') : '自定义'}
   后缀:   ${config.extensions.length ? config.extensions.join(', ') : '全部'}
   奖项:   ${config.awardCount} 个 (从低奖到高奖)
   按 Ctrl+C 退出
`);

  if (args.open) {
    open(server.url).catch(() => {});
  }

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
