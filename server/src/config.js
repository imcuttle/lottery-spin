import path from 'node:path';

function parseExtensions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .flatMap((s) => String(s).split(','))
      .map((s) => s.trim().replace(/^\./, '').toLowerCase())
      .filter(Boolean);
  }
  return String(raw)
    .split(',')
    .map((s) => s.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);
}

/**
 * 解析最终配置。优先级：CLI 参数 > 环境变量 > 默认值。
 * 所有相对路径都基于用户当前工作目录 (cwd) 解析。
 *
 * @param {object} cli  来自命令行的覆盖项 { dir, ext, awards, port }
 * @param {string} cwd  用户当前工作目录
 */
export function resolveConfig(cli = {}, cwd = process.cwd()) {
  const dirRaw = cli.dir || process.env.LOTTERY_DIR || '.';
  const extRaw =
    cli.ext != null ? cli.ext : process.env.LOTTERY_EXTENSIONS;
  const awardsRaw =
    cli.awards != null ? cli.awards : process.env.AWARD_COUNT;
  const portRaw = cli.port != null ? cli.port : process.env.PORT;

  return {
    cwd,
    port: Number(portRaw) || 8787,
    lotteryDir: path.isAbsolute(dirRaw) ? dirRaw : path.resolve(cwd, dirRaw),
    extensions: parseExtensions(extRaw),
    awardCount: Math.max(1, Number(awardsRaw) || 3),
  };
}
