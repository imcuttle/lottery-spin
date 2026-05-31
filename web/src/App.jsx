import { useEffect, useRef, useState, useCallback } from 'react';
import LotteryScene from './LotteryScene.js';

const RANK_LABELS = ['特等奖', '一等奖', '二等奖', '三等奖', '四等奖', '五等奖'];

const TYPE_LABELS = {
  image: '图片',
  video: '视频',
  audio: '音频',
  text: '文本',
  doc: '文档',
};

// 从低到高的序号文案：第 N 次抽取对应「倒数第 N 个奖项」
function rankLabel(awardIndexFromLow, total) {
  // awardIndexFromLow: 0 表示最低奖（最后一名），total-1 表示最高奖
  const placeFromTop = total - awardIndexFromLow; // 1 = 最高
  const label = RANK_LABELS[placeFromTop - 1] || `第 ${placeFromTop} 等奖`;
  return label;
}

export default function App() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);

  const [config, setConfig] = useState(null);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);

  const [drawnIndices, setDrawnIndices] = useState([]); // 已中奖文件在 files 中的原始索引
  const [drawing, setDrawing] = useState(false);
  const [currentWinner, setCurrentWinner] = useState(null); // { file, awardIndexFromLow }
  const [toast, setToast] = useState('');

  const awardCount = config?.awardCount ?? 0;
  const drawnCount = drawnIndices.length;
  const finished = awardCount > 0 && drawnCount >= awardCount;

  // 初始化场景 + 拉取数据
  useEffect(() => {
    const scene = new LotteryScene(mountRef.current);
    sceneRef.current = scene;

    (async () => {
      try {
        const [cfgRes, filesRes] = await Promise.all([
          fetch('/api/config').then((r) => r.json()),
          fetch('/api/files').then((r) => r.json()),
        ]);
        if (filesRes.error) {
          setError(filesRes.error);
          return;
        }
        if (!filesRes.files || filesRes.files.length === 0) {
          setError(
            `抽奖目录中没有匹配的文件：${(filesRes.dirs || []).join('、')}`
          );
          return;
        }
        if (filesRes.files.length < cfgRes.awardCount) {
          setError(
            `文件数量(${filesRes.files.length})少于奖项数量(${cfgRes.awardCount})，无法完成抽奖`
          );
          return;
        }
        setConfig(cfgRes);
        setFiles(filesRes.files);
        scene.setFiles(filesRes.files);
      } catch (e) {
        setError(`无法连接服务端：${String(e)}`);
      }
    })();

    return () => scene.dispose();
  }, []);

  const handleDraw = useCallback(() => {
    if (drawing || finished || files.length === 0) return;

    // 从未中奖文件中随机挑一个
    const remaining = files
      .map((_, i) => i)
      .filter((i) => !drawnIndices.includes(i));
    if (remaining.length === 0) return;

    const pick = remaining[Math.floor(Math.random() * remaining.length)];
    setDrawing(true);
    setToast('');

    sceneRef.current.draw(pick, () => {
      setCurrentWinner({
        file: files[pick],
        index: pick,
        awardIndexFromLow: drawnCount, // 第 drawnCount 次抽取 = 从低到高第 drawnCount 个
      });
    });
  }, [drawing, finished, files, drawnIndices, drawnCount]);

  const handleNext = useCallback(() => {
    if (!currentWinner) return;
    sceneRef.current.removeWinner(currentWinner.index);
    setDrawnIndices((prev) => [...prev, currentWinner.index]);
    setCurrentWinner(null);
    setDrawing(false);
    setToast('');
    sceneRef.current.reset();
  }, [currentWinner]);

  const handleOpen = useCallback(async () => {
    if (!currentWinner) return;
    setToast('正在打开…');
    try {
      const res = await fetch('/api/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentWinner.file.absolutePath }),
      });
      const data = await res.json();
      setToast(res.ok ? '已用系统默认程序打开 ✓' : `打开失败：${data.error}`);
    } catch (e) {
      setToast(`打开失败：${String(e)}`);
    }
  }, [currentWinner]);

  return (
    <div className="app">
      <div className="scene" ref={mountRef} />

      <div className="topbar">
        <div className="title">🎰 澳 门 老 虎 机 🎰</div>
        {config && (
          <div className="meta">
            候选文件：<b>{files.length}</b> 个
            <br />
            奖项数量：<b>{awardCount}</b>
            <br />
            {config.types && config.types.length > 0 && (
              <>
                类型：{config.types.map((t) => TYPE_LABELS[t] || t).join(' / ')}
                <br />
              </>
            )}
            后缀：{config.extensions.length ? config.extensions.join(' / ') : '全部'}
          </div>
        )}
      </div>

      {/* 中奖卡片 */}
      {currentWinner && (
        <div className="winner-card">
          <div className="winner-rank">
            🏆 {rankLabel(currentWinner.awardIndexFromLow, awardCount)}
          </div>
          <div className="winner-name">{currentWinner.file.name}</div>
          <div className="winner-path">{currentWinner.file.relativePath}</div>
          <div className="card-actions">
            <button className="btn btn-open" onClick={handleOpen}>
              打开文件
            </button>
            {drawnCount + 1 < awardCount ? (
              <button className="btn btn-next" onClick={handleNext}>
                抽下一个奖
              </button>
            ) : (
              <button className="btn btn-next" onClick={handleNext}>
                完成
              </button>
            )}
          </div>
          <div className="toast">{toast}</div>
        </div>
      )}

      {/* 底部控制 */}
      {!error && (
        <div className="dock">
          <div className="progress">
            {Array.from({ length: awardCount }).map((_, i) => {
              const cls =
                i < drawnCount ? 'done' : i === drawnCount ? 'current' : '';
              return (
                <span key={i} className={`pill ${cls}`}>
                  {rankLabel(i, awardCount)}
                </span>
              );
            })}
          </div>

          {finished ? (
            <div className="finale">🎉 全部奖项已抽出 🎉</div>
          ) : (
            !currentWinner && (
              <button
                className="draw-btn"
                onClick={handleDraw}
                disabled={drawing || !config}
              >
                {drawing ? '转 动 中…' : '🎲 拉 杆 抽 奖'}
              </button>
            )
          )}
        </div>
      )}

      {error && (
        <div className="overlay">
          <div className="big">⚠ 无法开始抽奖</div>
          <div className="hint">{error}</div>
          <div className="hint">
            请检查根目录 <code>.env</code> / <code>.env.local</code> 中的{' '}
            <code>LOTTERY_DIR</code>、<code>LOTTERY_EXTENSIONS</code> 配置。
          </div>
        </div>
      )}
    </div>
  );
}
