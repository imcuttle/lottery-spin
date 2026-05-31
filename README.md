# lottery-spin 🎰

目录文件**老虎机抽奖**全局命令行工具。

扫描指定目录下匹配后缀的文件作为奖品，澳门风格 Three.js 3D 老虎机抽奖，从低奖到高奖依次抽出，中奖文件可一键用系统默认程序打开。

- **服务端**：Node.js + Fastify
- **前端**：React + Vite + Three.js（已预构建打包进 npm 包）

## 安装

```bash
npm install -g lottery-spin
```

## 使用

进入任意目录直接运行，默认把**当前目录**作为抽奖目录：

```bash
cd ~/photos
lottery-spin -e jpg,png -a 3
```

启动后自动打开浏览器，点「拉杆抽奖」即可。

### 选项

| 选项 | 说明 | 默认 |
| --- | --- | --- |
| `-d, --dir <path>` | 抽奖文件目录，可重复指定多个或逗号分隔 | 当前目录 |
| `-e, --ext <list>` | 文件后缀集合，逗号分隔，留空匹配全部 | 全部 |
| `-a, --awards <n>` | 抽奖个数，从低奖到高奖依次抽出 | 3 |
| `-p, --port <n>` | 服务端口 | 8787 |
| `--no-open` | 启动后不自动打开浏览器 | |
| `-h, --help` | 显示帮助 | |
| `-v, --version` | 显示版本 | |

### 配置优先级

**命令行参数 > 环境变量 > 默认值**

环境变量可写在运行目录的 `.env` / `.env.local`（`.env.local` 优先级更高）：

```ini
# 单个目录，或逗号分隔多个目录
LOTTERY_DIR=./prizes
# LOTTERY_DIR=./gold,./silver,./bronze
LOTTERY_EXTENSIONS=jpg,png,mp4
AWARD_COUNT=3
PORT=8787
```

### 示例

```bash
# 抽当前目录下所有 jpg/png，共抽 3 个奖
lottery-spin -e jpg,png -a 3

# 指定目录与端口，抽 5 个奖
lottery-spin --dir ./prizes --awards 5 --port 9000

# 多个目录合并抽奖（重复 --dir 或逗号分隔）
lottery-spin -d ./gold -d ./silver -d ./bronze
lottery-spin -d ./gold,./silver,./bronze

# 用 .env 配置，不自动开浏览器
lottery-spin --no-open
```

## 玩法

1. 点「🎲 拉杆抽奖」，三个 3D 滚筒高速旋转，从左到右依次减速停下。
2. 三筒对齐中奖文件 → Jackpot 爆闪 + 金色粒子喷射，弹出中奖卡片（从最低奖开始）。
3. 点「打开文件」由服务端 `open` 调用系统默认程序打开。
4. 点「抽下一个奖」继续，直到抽满奖项数。同一文件不会重复中奖。

## 本地开发

```bash
git clone <repo> && cd lottery-spin
npm install
npm run dev      # 前端 5173 + 服务端 8799（代理 API）
# 或预览生产包：
npm run build && npm start
```

## License

MIT
