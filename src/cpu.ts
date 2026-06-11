export class CPU {
  a: number = 0;
  b: number = 0;
  c: number = 0;
  d: number = 0;
  e: number = 0;
  f: number = 0;
  h: number = 0;
  l: number = 0;

  // プログラムカウンタ（エントリーポイント）
  pc: number = 0x0100;

  // スタックポインタ
  sp: number = 0xfffe;

  // 各フラグ (z, n, h, c) の getter/setter
  // zfは結果が0であるかどうかを管理するフラグ
  get zf(): boolean {
    return (this.f & 0x80) !== 0;
  }
  set zf(v: boolean) {
    if (v) this.f |= 0x80;
    else this.f &= ~0x80;
  }

  get nf(): boolean {
    return (this.f & 0x40) !== 0;
  }
  set nf(v: boolean) {
    if (v) this.f |= 0x40;
    else this.f &= ~0x40;
  }

  get hf(): boolean {
    return (this.f & 0x20) !== 0;
  }
  set hf(v: boolean) {
    if (v) this.f |= 0x20;
    else this.f &= ~0x20;
  }

  get cf(): boolean {
    return (this.f & 0x10) !== 0;
  }
  set cf(v: boolean) {
    if (v) this.f |= 0x10;
    else this.f &= ~0x10;
  }

  memory: Uint8Array = new Uint8Array(0x10000); // 64KB

  cycles: number = 0;

  // 16ビットレジスタbc, de, hlのgetter/setter
  get bc(): number {
    return (this.b << 8) | this.c;
  }

  set bc(value: number) {
    this.b = (value >> 8) & 0xff;
    this.c = value & 0xff;
  }

  get de(): number {
    return (this.d << 8) | this.e;
  }

  set de(value: number) {
    this.d = (value >> 8) & 0xff;
    this.e = value & 0xff;
  }

  get hl(): number {
    return (this.h << 8) | this.l;
  }

  set hl(value: number) {
    this.h = (value >> 8) & 0xff;
    this.l = value & 0xff;
  }

  getRegisterByIndex(index: number): number {
    switch (index) {
      case 0:
        return this.b;
      case 1:
        return this.c;
      case 2:
        return this.d;
      case 3:
        return this.e;
      case 4:
        return this.h;
      case 5:
        return this.l;
      case 6:
        return this.memory[this.hl];
      case 7:
        return this.a;
      default:
        throw new Error('Invalid register index');
    }
  }

  setRegisterByIndex(index: number, value: number) {
    value &= 0xff;
    switch (index) {
      case 0:
        this.b = value;
        break;
      case 1:
        this.c = value;
        break;
      case 2:
        this.d = value;
        break;
      case 3:
        this.e = value;
        break;
      case 4:
        this.h = value;
        break;
      case 5:
        this.l = value;
        break;
      case 6:
        this.memory[this.hl] = value;
        break;
      case 7:
        this.a = value;
        break;
    }
  }

  fetch(): number {
    return this.memory[this.pc++];
  }

  step() {
    const opcode = this.fetch();
    this.execute(opcode);
    this.logState();
  }

  getCycles() {
    return this.cycles;
  }

  // 算術演算用のフラグ計算ヘルパー関数
  updateAddFlags(a: number, b: number, res: number) {
    this.zf = (res & 0xff) === 0; // 結果が 0 なら 1, それ以外なら 0
    this.nf = false; // 加算なので N は必ず 0
    this.hf = (a & 0x0f) + (b & 0x0f) > 0x0f; // 4 ビット目 (0x0F) から溢れたら 1
    this.cf = res > 0xff; // オーバーフローしたら 1
  }

  execute(opcode: number) {
    // LD r, r
    // レジスタ間の移動
    // 0x40 ~ 0x7F (ただし 0x76 HALT を除く)
    if (0x40 <= opcode && opcode <= 0x7f && opcode !== 0x76) {
      const srcIdx = opcode & 0b111;
      const destIdx = (opcode >> 3) & 0b111;

      const value = this.getRegisterByIndex(srcIdx);
      this.setRegisterByIndex(destIdx, value);

      this.cycles += srcIdx === 6 || destIdx === 6 ? 8 : 4;
      return;
    }

    // LD [r16mem], A
    // 16ビットレジスタが示すメモリ位置[r16mem] に レジスタAの値を書き込む
    // 0x02, 0x12, 0x22, 0x32
    if ((opcode & 0x0f) === 0x02) {
      switch (opcode) {
        case 0x02: // LD [BC], A
          this.memory[this.bc] = this.a;
          this.cycles += 8;
          break;
        case 0x12: // LD [DE], A
          this.memory[this.de] = this.a;
          this.cycles += 8;
          break;
        case 0x22: // LD [HL+], A
          this.memory[this.hl] = this.a;
          this.hl++; // LD [HL+], A では書き込みしたあとにHLをインクリメントする
          this.cycles += 8;
          break;
        case 0x32: // LD [HL-], A
          this.memory[this.hl] = this.a;
          this.hl--; // HL = HL - 1
          this.cycles += 8;
          break;
      }
    }

    // LD A, [r16mem]
    // 16ビットレジスタが示すメモリ位置[r16mem] の値を読み込み、レジスタAに書き込む
    // 0x0A, 0x1A, 0x2A, 0x3A
    if ((opcode & 0x0f) === 0x0a) {
      switch (opcode) {
        case 0x0a: // LD A, [BC]
          this.a = this.memory[this.bc];
          this.cycles += 8;
          break;
        case 0x1a: // LD A, [DE]
          this.a = this.memory[this.de];
          this.cycles += 8;
          break;
        case 0x2a: // LD A, [HL+]
          this.a = this.memory[this.hl];
          this.hl++;
          this.cycles += 8;
          break;
        case 0x3a: // LD A, [HL-]
          this.a = this.memory[this.hl];
          this.hl--;
          this.cycles += 8;
          break;
      }
    }

    // LD r, n (即値ロード)
    // 0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x36, 0x3E
    if ((opcode & 0x0f) === 0x06) {
      const destIdx = (opcode >> 3) & 0b111;
      const value = this.fetch(); // 次のバイトを即値として取得
      this.setRegisterByIndex(destIdx, value);
      this.cycles += destIdx === 6 ? 12 : 8; // [HL]への書き込みは遅いので 12 サイクルかかる
      return;
    }

    switch (opcode) {
      case 0x00: // NOP
        this.cycles += 4;
        break;
      case 0x3f: // CCF
        this.executeCCF();
        break;

      case 0xc6: {
        // ADD A, n

        const val = this.fetch();
        const res = this.a + val;

        // フラグ更新
        this.updateAddFlags(this.a, this.b, res);

        this.a = res & 0xff; // 最終的な結果を8ビットに収めて格納
        this.cycles += 8;
        break;
      }
    }
  }

  executeCCF() {
    // 1. キャリーフラグを反転 (XOR 1)
    const currentCarry = (this.f >> 4) & 1;
    const newCarry = currentCarry ^ 1;

    // 2. フラグを更新
    // Z (-): 変更なし
    // N (0): 0にリセット
    // H (0): 0にリセット
    // C (c): 反転した値を代入

    this.f &= 0x80;
    if (newCarry) {
      this.f |= 0x10;
    }
    this.cycles += 4;
  }

  logState() {
    console.log(
      `PC: ${this.pc.toString(16).padStart(4, '0')} | ` +
        `AF: ${((this.a << 8) | this.f).toString(16).padStart(4, '0')} | ` +
        `BC: ${((this.b << 8) | this.c).toString(16).padStart(4, '0')} | ` +
        `HL: ${this.hl.toString(16).padStart(4, '0')} | ` +
        `CYC: ${this.cycles}`,
    );
  }
}
