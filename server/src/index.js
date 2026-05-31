import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { globby } from 'globby';
import open from 'open';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 前端构建产物：随包发布时位于包根的 web/dist
function resolveWebDist() {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'web', 'dist'), // 包根/web/dist
    path.resolve(__dirname, '..', 'web', 'dist'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

/**
 * 用 globby 扫描抽奖目录，返回匹配后缀的文件列表。
 */
async function scanFiles(config) {
  const dir = config.lotteryDir;
  if (!fs.existsSync(dir)) {
    return { dir, files: [], error: `抽奖目录不存在: ${dir}` };
  }

  const patterns =
    config.extensions.length > 0
      ? config.extensions.map((ext) => `**/*.${ext}`)
      : ['**/*'];

  const entries = await globby(patterns, {
    cwd: dir,
    onlyFiles: true,
    caseSensitiveMatch: false,
    dot: false,
  });

  const files = entries.map((rel) => {
    const abs = path.join(dir, rel);
    return {
      id: rel,
      name: path.basename(rel),
      relativePath: rel,
      absolutePath: abs,
      ext: path.extname(rel).replace(/^\./, '').toLowerCase(),
    };
  });

  return { dir, files, error: null };
}

/**
 * 启动抽奖服务。
 * @param {object} config resolveConfig() 的返回值
 * @returns {Promise<{ url: string, address: string, close: () => Promise<void> }>}
 */
export async function startServer(config) {
  const fastify = Fastify({ logger: { level: 'warn' } });
  const WEB_DIST = resolveWebDist();

  fastify.get('/api/config', async () => ({
    lotteryDir: config.lotteryDir,
    extensions: config.extensions,
    awardCount: config.awardCount,
  }));

  fastify.get('/api/files', async (request, reply) => {
    const { dir, files, error } = await scanFiles(config);
    if (error) {
      return reply.code(404).send({ error, dir, files: [] });
    }
    return { dir, total: files.length, awardCount: config.awardCount, files };
  });

  fastify.post('/api/open', async (request, reply) => {
    const { path: filePath } = request.body || {};
    if (!filePath || typeof filePath !== 'string') {
      return reply.code(400).send({ error: '缺少 path 参数' });
    }
    const resolved = path.resolve(filePath);
    const base = path.resolve(config.lotteryDir);
    if (resolved !== base && !resolved.startsWith(base + path.sep)) {
      return reply.code(403).send({ error: '禁止打开抽奖目录之外的文件' });
    }
    if (!fs.existsSync(resolved)) {
      return reply.code(404).send({ error: '文件不存在' });
    }
    try {
      await open(resolved);
      return { ok: true, opened: resolved };
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: '打开文件失败', detail: String(err) });
    }
  });

  if (fs.existsSync(WEB_DIST)) {
    await fastify.register(fastifyStatic, { root: WEB_DIST });
    fastify.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not Found' });
      }
      return reply.sendFile('index.html');
    });
  } else {
    fastify.log.warn(`未找到前端构建产物: ${WEB_DIST}`);
  }

  await fastify.listen({ port: config.port, host: '0.0.0.0' });
  const url = `http://localhost:${config.port}`;

  return {
    url,
    webDist: WEB_DIST,
    close: () => fastify.close(),
  };
}
