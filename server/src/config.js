import path from 'node:path';

/**
 * 文件类型预设：类型名 -> 后缀集合。
 * 配置时可用类型名快速选择一类文件，支持多个类型。
 */
export const FILE_TYPE_PRESETS = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic'],
  video: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'flv', 'm4v', 'wmv'],
  audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'],
  text: ['txt', 'md', 'markdown', 'rtf', 'log', 'csv'],
  doc: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'],
};

// 未指定任何后缀/类型时的默认预设
const DEFAULT_TYPES = ['image', 'video', 'text'];

function parseList(raw) {
  if (raw == null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .flatMap((s) => String(s).split(','))
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeExt(s) {
  return s.replace(/^\./, '').toLowerCase();
}

function parseExtensions(raw) {
  return parseList(raw).map(normalizeExt);
}

/** 把类型名展开成后缀集合，未知类型忽略 */
function expandTypes(raw) {
  const exts = [];
  for (const t of parseList(raw)) {
    const preset = FILE_TYPE_PRESETS[t.toLowerCase()];
    if (preset) exts.push(...preset);
  }
  return exts;
}

/**
 * 解析最终配置。优先级：CLI 参数 > 环境变量 > 默认值。
 * 所有相对路径都基于用户当前工作目录 (cwd) 解析。
 *
 * 支持多个抽奖目录：
 *   - CLI：可重复 --dir，或单个 --dir 用逗号分隔
 *   - 环境变量：LOTTERY_DIR 用逗号分隔多个目录
 *
 * 文件后缀的确定方式（取并集）：
 *   - 文件类型预设：--type image,video / LOTTERY_TYPES（展开为后缀集合）
 *   - 显式后缀：    --ext jpg,png / LOTTERY_EXTENSIONS
 *   - 两者都未指定时，使用默认预设：图片 + 视频 + 文本
 *
 * @param {object} cli  来自命令行的覆盖项 { dir, ext, type, awards, port }
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
  const typeRaw = cli.type != null ? cli.type : process.env.LOTTERY_TYPES;
  const awardsRaw = cli.awards != null ? cli.awards : process.env.AWARD_COUNT;
  const portRaw = cli.port != null ? cli.port : process.env.PORT;

  const typeList = parseList(typeRaw).map((t) => t.toLowerCase());
  const explicitExts = parseExtensions(extRaw);
  const typeExts = expandTypes(typeRaw);

  // 用户未指定任何后缀/类型时，回退到默认预设
  const noneSpecified = explicitExts.length === 0 && typeExts.length === 0;
  const effectiveTypes = noneSpecified ? DEFAULT_TYPES.slice() : typeList;
  const mergedExts = noneSpecified
    ? expandTypes(DEFAULT_TYPES)
    : [...typeExts, ...explicitExts];

  // 去重，保持顺序
  const extensions = [...new Set(mergedExts)];

  return {
    cwd,
    port: Number(portRaw) || 8787,
    lotteryDirs,
    types: effectiveTypes,
    extensions,
    awardCount: Math.max(1, Number(awardsRaw) || 3),
  };
}
