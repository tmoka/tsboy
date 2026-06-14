import { BUS } from './bus.ts';

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

  // 割り込みマスターイネーブルフラグ
  ime: boolean = false;

  // BUS
  bus: BUS;

  constructor(bus: BUS) {
    this.bus = bus;
  }

  // サイクル数
  cycles: number = 0;

  // メモリ読み込み
  read(address: number): number {
    return this.bus.read8(address);
  }

  // メモリ書き込み
  write(address: number, value: number) {
    this.bus.write8(address, value & 0xff);
  }

  fetch(): number {
    return this.read(this.pc++);
  }

  // スタックに16bitの値を追加
  push(value: number) {
    this.sp -= 2;
    this.write(this.sp, value & 0xff); // 下位バイト
    this.write(this.sp + 1, (value >> 8) & 0xff); // 上位バイト
  }

  // スタックから16bitの値を取得
  pop(): number {
    const low = this.read(this.sp);
    const high = this.read(this.sp + 1);
    this.sp += 2;
    return (high << 8) | low;
  }

  // 16bitアドレスを取得
  getAddress(): number {
    const low = this.fetch();
    const high = this.fetch();
    return (high << 8) | low;
  }

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
        return this.read(this.hl);
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
        this.write(this.hl, value);
        break;
      case 7:
        this.a = value;
        break;
    }
  }

  step() {
    const opcode = this.fetch();
    this.execute(opcode);
    this.logState();
  }

  getCycles() {
    return this.cycles;
  }

  // 算術演算用のフラグ計算ヘルパーメソッド
  updateAddFlags(a: number, b: number, res: number) {
    this.zf = (res & 0xff) === 0; // 結果が 0 なら 1, それ以外なら 0
    this.nf = false; // 加算なので N は必ず 0
    this.hf = (a & 0x0f) + (b & 0x0f) > 0x0f; // 4 ビット目 (0x0F) から溢れたら 1
    this.cf = res > 0xff; // オーバーフローしたら 1
  }

  // ジャンプ命令の条件判定用のヘルパーメソッド
  jumpCheckCondition(jumpConditionCode: number): boolean {
    switch (jumpConditionCode) {
      case 0:
        return !this.zf; // NZ (Zeroフラグが0)
      case 1:
        return this.zf; // Z  (Zeroフラグが1)
      case 2:
        return !this.cf; // NC (Carryフラグが0)
      case 3:
        return this.cf; // C  (Carryフラグが1)
      default:
        return false;
    }
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

    // LD r16mem, u16
    // 0x01, 0x11, 0x21, 0x31
    if (0x01 <= opcode && opcode <= 0x31 && (opcode & 0x0f) === 0x01) {
      const value = this.getAddress();
      switch (opcode) {
        case 0x01: // LD BC, u16
          this.bc = value;
          this.cycles += 12;
          break;
        case 0x11: // LD DE, u16
          this.de = value;
          this.cycles += 12;
          break;
        case 0x21: // LD HL, u16
          this.hl = value;
          this.cycles += 12;
          break;
        case 0x31: // LD SP, u16
          this.sp = value;
          this.cycles += 12;
          break;
      }
      return;
    }

    // LD [r16mem], A
    // 16ビットレジスタが示すメモリ位置[r16mem] に レジスタAの値を書き込む
    // 0x02, 0x12, 0x22, 0x32
    if (0x02 <= opcode && opcode <= 0x32 && (opcode & 0x0f) === 0x02) {
      switch (opcode) {
        case 0x02: // LD [BC], A
          this.write(this.bc, this.a);
          this.cycles += 8;
          break;
        case 0x12: // LD [DE], A
          this.write(this.de, this.a);
          this.cycles += 8;
          break;
        case 0x22: // LD [HL+], A
          this.write(this.hl, this.a);
          this.hl++; // LD [HL+], A では書き込みしたあとにHLをインクリメントする
          this.cycles += 8;
          break;
        case 0x32: // LD [HL-], A
          this.write(this.hl, this.a);
          this.hl--; // HL = HL - 1
          this.cycles += 8;
          break;
      }
    }

    // LD A, [r16mem]
    // 16ビットレジスタが示すメモリ位置[r16mem] の値を読み込み、レジスタAに書き込む
    // 0x0A, 0x1A, 0x2A, 0x3A
    if (0x0a <= opcode && opcode <= 0x3a && (opcode & 0x0f) === 0x0a) {
      switch (opcode) {
        case 0x0a: // LD A, [BC]
          this.a = this.read(this.bc);
          this.cycles += 8;
          break;
        case 0x1a: // LD A, [DE]
          this.a = this.read(this.de);
          this.cycles += 8;
          break;
        case 0x2a: // LD A, [HL+]
          this.a = this.read(this.hl);
          this.hl++;
          this.cycles += 8;
          break;
        case 0x3a: // LD A, [HL-]
          this.a = this.read(this.hl);
          this.hl--;
          this.cycles += 8;
          break;
      }
    }

    // LD r, n (即値ロード)
    // 0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x36, 0x3E
    if ((opcode & 0xc7) === 0x06) {
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

      // JR e (無条件の相対ジャンプ)
      case 0x18: {
        let offset = this.fetch();

        // 符号付き8ビット整数 (-128 〜 127) に変換する
        // 127を超える値 (128~255) は負の数として扱う
        if (offset > 127) {
          offset -= 256;
        }

        // 現在の PC にオフセットを足す（引く）
        this.pc += offset;

        this.cycles += 12; // オペコード(4) + オフセット読み込み(4) + ジャンプ処理(4)
        break;
      }

      case 0x3f: // CCF
        this.executeCCF();
        break;

      case 0xc6: {
        // ADD A, n

        const val = this.fetch();
        const res = this.a + val;

        // フラグ更新
        this.updateAddFlags(this.a, val, res);

        this.a = res & 0xff; // 最終的な結果を8ビットに収めて格納
        this.cycles += 8;
        break;
      }

      case 0xc2:
      case 0xca:
      case 0xd2:
      case 0xda: {
        const condition = (opcode >> 3) & 0b11;
        const address = this.getAddress();
        const isConditionMet = this.jumpCheckCondition(condition);
        if (isConditionMet) {
          this.pc = address;
          this.cycles += 16;
        } else {
          this.cycles += 12;
        }
        break;
      }

      // JP NN
      case 0xc3: {
        const low = this.fetch();
        const high = this.fetch();
        this.pc = (high << 8) | low;
        this.cycles += 16;
        break;
      }

      // LD (FF00+u8), A (0xFF00 + n のアドレスに A を書き込む)
      case 0xe0: {
        const offset = this.fetch(); // 1バイト（オフセット）を読み込む
        this.write(0xff00 + offset, this.a);
        this.cycles += 12;
        break;
      }

      // LD (FF00+C), A (0xFF00 + C のアドレスに A を書き込む)
      case 0xe2: {
        this.write(0xff00 + this.c, this.a);
        this.cycles += 8;
        break;
      }

      // JP HL
      // HLレジスタが示すアドレスにジャンプする
      // PCにHLレジスタが保持している値を代入してやればok
      case 0xe9: {
        this.pc = this.hl;
        this.cycles += 4;
        break;
      }

      // CALL u16
      case 0xcd: {
        const address = this.getAddress();
        this.push(this.pc);
        this.pc = address;
        this.cycles += 24;
        break;
      }

      // RET (0xC9)
      case 0xc9: {
        this.pc = this.pop();
        this.cycles += 16;
        break;
      }

      // LD [u16], A (Aの値を16ビット即値アドレスに書き込む)
      case 0xea: {
        const address = this.getAddress();

        this.write(address, this.a);
        this.cycles += 16;
        break;
      }

      // DI (Disable Interrupts)
      case 0xf3: {
        this.ime = false;
        this.cycles += 4;
        break;
      }

      // EI (Enable Interrupts)
      case 0xfb: {
        this.ime = true;
        this.cycles += 4;
        break;
      }

      // PUSH 関連
      case 0xe5: {
        this.push(this.hl);
        this.cycles += 16;
        break;
      }
      case 0xc5: {
        this.push(this.bc);
        this.cycles += 16;
        break;
      }
      case 0xd5: {
        this.push(this.de);
        this.cycles += 16;
        break;
      }
      case 0xf5: {
        this.push((this.a << 8) | this.f);
        this.cycles += 16;
        break;
      }

      default:
        console.error(
          `未実装の命令です: 0x${opcode.toString(16).padStart(2, '0')} (PC: 0x${(this.pc - 1).toString(16).padStart(4, '0')})`,
        );
        throw new Error('Not Implemented Opcode');
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
