import * as THREE from 'three';

/**
 * 澳门风格老虎机抽奖 3D 场景。
 * - 三个 3D 滚筒（drum），筒面贴满文件名卡片
 * - draw() 触发：三筒高速旋转模糊，从左到右依次减速停下
 * - 三筒同时停在中奖文件 -> 中奖线爆闪 + 金色粒子喷射（Jackpot）
 *
 * 对外接口与原场景一致：setFiles / draw / reset / removeWinner / dispose
 */

const N = 14; // 每个滚筒的卡片数
const STEP = (Math.PI * 2) / N; // 相邻卡片夹角
const R = 8; // 滚筒半径
const CARD_W = 11;
const CARD_H = 3.2;
const REEL_X = [-12.5, 0, 12.5]; // 三个滚筒的横向位置

const GOLD = 0xffd86b;
const RED = 0xff3b5c;

function easeOutQuart(p) {
  return 1 - Math.pow(1 - p, 4);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 生成一张文件名卡片纹理（赌场金色风格） */
function makeLabelTexture(text, win = false) {
  const cw = 512;
  const ch = 150;
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');

  // 底色渐变
  const bg = ctx.createLinearGradient(0, 0, 0, ch);
  if (win) {
    bg.addColorStop(0, '#3a2206');
    bg.addColorStop(0.5, '#5a3408');
    bg.addColorStop(1, '#2a1804');
  } else {
    bg.addColorStop(0, '#1a1020');
    bg.addColorStop(0.5, '#241430');
    bg.addColorStop(1, '#140a1c');
  }
  ctx.fillStyle = bg;
  roundRect(ctx, 8, 8, cw - 16, ch - 16, 22);
  ctx.fill();

  // 金边
  ctx.lineWidth = 6;
  ctx.strokeStyle = win ? '#ffe9a8' : '#caa24a';
  ctx.shadowColor = win ? '#ffd86b' : '#7a5a18';
  ctx.shadowBlur = win ? 26 : 8;
  roundRect(ctx, 8, 8, cw - 16, ch - 16, 22);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 文本（自适应缩放 + 截断）
  let label = text || '';
  if (label.length > 22) label = label.slice(0, 21) + '…';
  let fontSize = 56;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  do {
    ctx.font = `700 ${fontSize}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
    if (ctx.measureText(label).width < cw - 70) break;
    fontSize -= 3;
  } while (fontSize > 20);

  ctx.fillStyle = win ? '#fff6d8' : '#ffd86b';
  ctx.shadowColor = win ? '#ffae33' : 'rgba(255,216,107,0.5)';
  ctx.shadowBlur = win ? 22 : 10;
  ctx.fillText(label, cw / 2, ch / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default class LotteryScene {
  constructor(container) {
    this.container = container;
    this.files = [];
    this.removed = new Set();
    this.reels = [];
    this.activeDraw = false;
    this.pendingDone = null;
    this.jackpot = 0; // 0..1 中奖爆闪强度
    this.clock = new THREE.Clock();
    this._raf = null;

    this._initThree();
    this._initStage();
    this._initReels();
    this._initSparks();

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._animate();
  }

  _initThree() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x140208, 0.014);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
    this.camera.position.set(0, 1.5, 34);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.container.appendChild(this.renderer.domElement);

    // 灯光：暖金主光 + 红色补光
    this.scene.add(new THREE.AmbientLight(0x553344, 1.4));
    const gold = new THREE.PointLight(GOLD, 2.6, 400);
    gold.position.set(0, 30, 50);
    this.scene.add(gold);
    const red = new THREE.PointLight(RED, 1.8, 400);
    red.position.set(-40, -10, 40);
    this.scene.add(red);
    const blue = new THREE.PointLight(0x4488ff, 1.0, 400);
    blue.position.set(40, -10, 40);
    this.scene.add(blue);

    // 中奖时的爆闪光
    this.flashLight = new THREE.PointLight(0xfff0c0, 0, 600);
    this.flashLight.position.set(0, 0, 30);
    this.scene.add(this.flashLight);
  }

  /** 机身：背景辉光、金色边框、中奖线、上下遮罩 */
  _initStage() {
    // 背景大辉光面
    const bgGeo = new THREE.PlaneGeometry(260, 180);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x2a0512 });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    bg.position.set(0, 0, -40);
    this.scene.add(bg);

    // 机身金色外框（四条边）
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xffcf5a,
      emissive: 0x6a4a10,
      emissiveIntensity: 0.7,
      metalness: 0.95,
      roughness: 0.25,
    });
    const FW = 46;
    const FH = 16;
    const t = 1.6;
    const frames = [
      [0, FH / 2, FW, t],
      [0, -FH / 2, FW, t],
      [-FW / 2, 0, t, FH + t],
      [FW / 2, 0, t, FH + t],
    ];
    for (const [x, y, w, h] of frames) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.2), frameMat);
      m.position.set(x, y, 9.5);
      this.scene.add(m);
    }

    // 上下黑色遮罩（只露出中间一行）
    const maskMat = new THREE.MeshStandardMaterial({
      color: 0x0c0208,
      metalness: 0.6,
      roughness: 0.4,
    });
    const maskTop = new THREE.Mesh(new THREE.BoxGeometry(FW, 12, 2), maskMat);
    maskTop.position.set(0, 5 + 6, 10);
    this.scene.add(maskTop);
    const maskBot = new THREE.Mesh(new THREE.BoxGeometry(FW, 12, 2), maskMat);
    maskBot.position.set(0, -5 - 6, 10);
    this.scene.add(maskBot);

    // 中奖线（上下两条发光横条）
    this.paylineMat = new THREE.MeshBasicMaterial({
      color: RED,
      transparent: true,
      opacity: 0.9,
    });
    const lineTop = new THREE.Mesh(
      new THREE.BoxGeometry(FW - 2, 0.35, 0.5),
      this.paylineMat
    );
    lineTop.position.set(0, 5, 10.6);
    this.scene.add(lineTop);
    const lineBot = new THREE.Mesh(
      new THREE.BoxGeometry(FW - 2, 0.35, 0.5),
      this.paylineMat
    );
    lineBot.position.set(0, -5, 10.6);
    this.scene.add(lineBot);

    // 滚筒间的金色分隔条
    const divMat = new THREE.MeshStandardMaterial({
      color: 0xffcf5a,
      emissive: 0x5a3c08,
      emissiveIntensity: 0.6,
      metalness: 0.9,
      roughness: 0.3,
    });
    for (const dx of [-6.25, 6.25]) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.5, 11, 1.5), divMat);
      d.position.set(dx, 0, 10);
      this.scene.add(d);
    }
  }

  _initReels() {
    for (let r = 0; r < 3; r++) {
      const group = new THREE.Group();
      group.position.x = REEL_X[r];
      this.scene.add(group);

      const cards = [];
      for (let i = 0; i < N; i++) {
        const theta = i * STEP;
        const mat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0x222222,
          emissiveIntensity: 0.4,
          roughness: 0.6,
          metalness: 0.1,
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H), mat);
        mesh.position.set(0, R * Math.sin(theta), R * Math.cos(theta));
        mesh.rotation.x = -theta;
        group.add(mesh);
        cards.push({ mesh, theta });
      }

      this.reels.push({
        group,
        cards,
        labels: new Array(N).fill(''),
        winnerSlot: 0,
        startAngle: 0,
        targetAngle: 0,
        duration: 1,
        elapsed: 0,
        spinning: false,
        stopped: true,
      });
    }
  }

  _initSparks() {
    // 常驻飘动的金色亮片
    const count = 260;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 120;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 80;
      positions[i * 3 + 2] = -10 - Math.random() * 30;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.ambientSparks = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: GOLD,
        size: 0.9,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.scene.add(this.ambientSparks);

    // 中奖爆炸粒子
    this.burstCount = 400;
    const bpos = new Float32Array(this.burstCount * 3);
    this.burstVel = new Float32Array(this.burstCount * 3);
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
    this.burst = new THREE.Points(
      bgeo,
      new THREE.PointsMaterial({
        color: 0xffe9a8,
        size: 1.6,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.scene.add(this.burst);
    this.burstLife = 0;
  }

  // ===== 对外接口 =====

  setFiles(files) {
    this.files = files || [];
    this.removed = new Set();
    for (const reel of this.reels) {
      const labels = this._sampleLabels();
      this._applyLabels(reel, labels, -1);
    }
  }

  /**
   * 开始一次老虎机抽奖。
   * @param {number} targetIndex 命中文件在 files 中的索引
   * @param {() => void} onDone 三筒停稳（Jackpot）回调
   */
  draw(targetIndex, onDone) {
    if (this.activeDraw || this.files.length === 0) return;
    const winner = this.files[targetIndex];
    if (!winner) return;

    this.activeDraw = true;
    this.pendingDone = onDone;
    this.jackpot = 0;

    this.reels.forEach((reel, r) => {
      // 重新铺卡片，并把中奖文件放到随机槽位
      const labels = this._sampleLabels();
      const slot = Math.floor(Math.random() * N);
      labels[slot] = winner.name;
      this._applyLabels(reel, labels, slot);
      reel.winnerSlot = slot;

      // 归一化当前角度，避免数值无限增大
      reel.group.rotation.x = reel.group.rotation.x % (Math.PI * 2);
      reel.startAngle = reel.group.rotation.x;

      // 目标角度：使 winnerSlot 转到正前方。
      // 卡片在 theta=slot*STEP，绕 x 轴旋转 phi 后有效角为 theta-phi，
      // 要居中到 payline 需 theta-phi=0，即 rotation.x = slot*STEP。
      const spins = 7 + r * 1.5 + Math.random();
      reel.targetAngle =
        slot * STEP - Math.ceil(spins) * Math.PI * 2;

      // 从左到右依次停下
      reel.duration = 2.3 + r * 0.7;
      reel.elapsed = 0;
      reel.spinning = true;
      reel.stopped = false;
    });
  }

  reset() {
    this.activeDraw = false;
    this.pendingDone = null;
    this.jackpot = 0;
    this.burstLife = 0;
    this.burst.material.opacity = 0;
    for (const reel of this.reels) {
      reel.spinning = false;
      reel.stopped = true;
      reel.group.rotation.x = reel.group.rotation.x % (Math.PI * 2);
      // 取消中奖卡高亮
      this._applyLabels(reel, this._sampleLabels(), -1);
    }
  }

  /** 标记某文件已中奖，后续不再作为填充项出现 */
  removeWinner(index) {
    this.removed.add(index);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }

  // ===== 内部辅助 =====

  /** 从未中奖文件名里随机取 N 个作为滚筒填充 */
  _sampleLabels() {
    const pool = this.files
      .filter((_, i) => !this.removed.has(i))
      .map((f) => f.name);
    const labels = [];
    if (pool.length === 0) {
      return new Array(N).fill('—');
    }
    for (let i = 0; i < N; i++) {
      labels.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return labels;
  }

  /** 把文字应用到滚筒卡片纹理上，winnerSlot 用高亮样式 */
  _applyLabels(reel, labels, winnerSlot) {
    reel.labels = labels;
    reel.cards.forEach((card, i) => {
      const mat = card.mesh.material;
      if (mat.map) mat.map.dispose();
      const isWin = i === winnerSlot;
      mat.map = makeLabelTexture(labels[i], isWin);
      mat.emissive.setHex(isWin ? 0x7a5410 : 0x222222);
      mat.emissiveIntensity = isWin ? 1.1 : 0.4;
      mat.needsUpdate = true;
      card.mesh.scale.setScalar(1);
    });
  }

  _triggerJackpot() {
    this.jackpot = 1;
    // 喷射金色粒子
    const pos = this.burst.geometry.attributes.position.array;
    for (let i = 0; i < this.burstCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 4;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 4;
      pos[i * 3 + 2] = 9 + Math.random() * 2;
      const ang = Math.random() * Math.PI * 2;
      const sp = 14 + Math.random() * 26;
      this.burstVel[i * 3] = Math.cos(ang) * sp;
      this.burstVel[i * 3 + 1] = Math.sin(ang) * sp + 6;
      this.burstVel[i * 3 + 2] = (Math.random() - 0.5) * 8;
    }
    this.burst.geometry.attributes.position.needsUpdate = true;
    this.burst.material.opacity = 1;
    this.burstLife = 1.6;
  }

  _animate() {
    this._raf = requestAnimationFrame(() => this._animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    let anySpinning = false;

    for (const reel of this.reels) {
      if (reel.spinning) {
        anySpinning = true;
        reel.elapsed += dt;
        const p = Math.min(reel.elapsed / reel.duration, 1);
        const e = easeOutQuart(p);
        reel.group.rotation.x =
          reel.startAngle + (reel.targetAngle - reel.startAngle) * e;
        if (p >= 1) {
          reel.spinning = false;
          reel.stopped = true;
          reel.group.rotation.x = reel.group.rotation.x % (Math.PI * 2);
        }
      }
    }

    // 三筒全部停稳 -> Jackpot
    if (this.activeDraw && !anySpinning && this.jackpot === 0) {
      this._triggerJackpot();
      if (this.pendingDone) {
        const cb = this.pendingDone;
        this.pendingDone = null;
        cb();
      }
    }

    // 中奖卡片呼吸高亮
    if (this.activeDraw && !anySpinning) {
      const pulse = 1 + Math.sin(t * 6) * 0.06;
      for (const reel of this.reels) {
        const card = reel.cards[reel.winnerSlot];
        if (card) {
          card.mesh.scale.setScalar(pulse);
          card.mesh.material.emissiveIntensity = 1.0 + Math.sin(t * 6) * 0.5;
        }
      }
    }

    // 中奖线脉动：抽奖中急促，平时缓和
    const beat = anySpinning ? Math.abs(Math.sin(t * 12)) : 0.5 + Math.sin(t * 2) * 0.4;
    this.paylineMat.opacity = 0.35 + beat * 0.65;

    // 爆闪余晖
    if (this.jackpot > 0) this.jackpot = Math.max(0, this.jackpot - dt * 1.2);
    this.flashLight.intensity = this.jackpot * 10;

    // 爆炸粒子更新
    if (this.burstLife > 0) {
      this.burstLife -= dt;
      const pos = this.burst.geometry.attributes.position.array;
      for (let i = 0; i < this.burstCount; i++) {
        pos[i * 3] += this.burstVel[i * 3] * dt;
        pos[i * 3 + 1] += this.burstVel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += this.burstVel[i * 3 + 2] * dt;
        this.burstVel[i * 3 + 1] -= 26 * dt; // 重力
      }
      this.burst.geometry.attributes.position.needsUpdate = true;
      this.burst.material.opacity = Math.max(0, this.burstLife / 1.6);
    }

    // 常驻亮片轻微旋转 + 闪烁
    this.ambientSparks.rotation.z += dt * 0.02;
    this.ambientSparks.material.opacity = 0.5 + Math.sin(t * 2) * 0.25;

    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
