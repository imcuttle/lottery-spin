import path from 'node:path';

function parseList(raw) {
  if (raw == null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .flatMap((s) => String(s).split(','))
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseExtensions(raw) {
  return parseList(raw).map((s) => s.replace(/^\./, '').toLowerCase());
}

/**
 * 解析最终配置。优先级：CLI 参数 > 环境变量 > 默认值。
 * 所有相对路径都基于用户当前工作目录 (cwd) 解析。
 *
 * 支持多个抽奖目录：
 *   - CLI：可重复 --dir，或单个 --dir 用逗号分隔
 *   - 环境变量：LOTTERY_DIR 用逗号分隔多个目录
 *
 * @param {object} cli  来自命令行的覆盖项 { dir, ext, awards, port }
 * @param {string} cwd  用户当前工作目录
 */
export function resolveConfig(cli = {}, cwd = process.cwd()) {
  const dirRaw = cli.dir != null ? cli.dir : process.env.LOTTERY_DIR;
  let dirList = parseList(dirRaw);
  if (dirList.length === 0) dirList = ['.'];

  // 去重并解析为绝对路径，保持顺序（奖项目录顺序对用户有意义）
  const seen = new Set();
  const lotteryDirs = [];
  for (const d of dirList) {
    const abs = path.isAbsolute(d) ? d : path.resolve(cwd, d);
    if (!seen.has(abs)) {
      seen.add(abs);
      lotteryDirs.push(abs);
    }
  }

  const extRaw = cli.ext != null ? cli.ext : process.env.LOTTERY_EXTENSIONS;
  const awardsRaw = cli.awards != null ? cli.awards : process.env.AWARD_COUNT;
  const portRaw = cli.port != null ? cli.port : process.env.PORT;

  return {
    cwd,
    port: Number(portRaw) || 8787,
    lotteryDirs,
    extensions: parseExtensions(extRaw),
    awardCount: Math.max(1, Number(awardsRaw) || 3),
  };
}
