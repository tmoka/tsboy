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

  // 8bit インクリメント用のヘルパーメソッド
  inc8(value: number): number {
    const result = (value + 1) & 0xff;
    this.zf = result === 0;
    this.nf = false;
    this.hf = (value & 0x0f) === 0x0f; // 下位4ビットがすべて1ならハーフキャリー
    // cf(キャリーフラグ) は変更しない！
    return result;
  }

  // 8bit デクリメント用のヘルパーメソッド
  dec8(value: number): number {
    const result = (value - 1) & 0xff;
    this.zf = result === 0;
    this.nf = true; // 引き算なのでNフラグを立てる
    this.hf = (value & 0x0f) === 0x00; // 下位4ビットが0からの引き算ならハーフボロー
    // cf(キャリーフラグ) は変更しない！
    return result;
  }

  // 比較(CP)用のヘルパーメソッド
  cp(value: number) {
    const result = this.a - value;

    this.zf = (result & 0xff) === 0;
    this.nf = true; // 引き算なので必ず true
    this.hf = (this.a & 0x0f) < (value & 0x0f); // 下位4ビットで桁借りが発生したか
    this.cf = this.a < value; // 全体で桁借りが発生したか（Aよりvalueの方が大きいか）
  }

  // 減算(sum)用のヘルパーメソッド
  sub(value: number) {
    const result = this.a - value;

    this.zf = (result & 0xff) === 0;
    this.nf = true; // 引き算なので必ず true
    this.hf = (this.a & 0x0f) < (value & 0x0f); // 下位4ビットで桁借りが発生したか
    this.cf = this.a < value; // 全体で桁借りが発生したか

    this.a = result & 0xff;
  }

  // ADC (キャリー付き加算) 用ヘルパーメソッド
  adc(value: number) {
    const carry = this.cf ? 1 : 0;
    const result = this.a + value + carry;

    this.zf = (result & 0xff) === 0;
    this.nf = false; // 加算なので false
    this.hf = (this.a & 0x0f) + (value & 0x0f) + carry > 0x0f;
    this.cf = result > 0xff;

    this.a = result & 0xff;
  }

  // SBC (キャリー付き減算) 用ヘルパーメソッド
  sbc(value: number) {
    const carry = this.cf ? 1 : 0;
    const result = this.a - value - carry;

    this.zf = (result & 0xff) === 0;
    this.nf = true; // 減算なので true
    this.hf = (this.a & 0x0f) - (value & 0x0f) - carry < 0;
    this.cf = result < 0; // 全体でマイナスになったら桁借り発生

    this.a = result & 0xff;
  }

  // ADD HL, r16 用ヘルパー
  addHL(val: number) {
    const res = (this.hl + val) & 0xffff;

    this.nf = false;
    this.hf = (this.hl & 0x0fff) + (val & 0x0fff) > 0x0fff;
    this.cf = this.hl + val > 0xffff;

    this.hl = res;
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
      return;
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
      return;
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

    // JR cc, r8 (条件付き相対ジャンプ)
    // 0x20, 0x28, 0x30, 0x38
    if (0x20 <= opcode && opcode <= 0x38 && (opcode & 0x07) === 0x00) {
      const condition = (opcode >> 3) & 0b11; // 0:NZ, 1:Z, 2:NC, 3:C
      let offset = this.fetch();

      const isConditionMet = this.jumpCheckCondition(condition);

      if (isConditionMet) {
        if (offset > 127) offset -= 256;
        this.pc += offset;
        this.cycles += 12;
      } else {
        this.cycles += 8;
      }
      return;
    }

    // AND A, r8 (A レジスタと論理積をとる)
    // 0xA0 ~ 0xA7
    if (0xa0 <= opcode && opcode <= 0xa7) {
      const regIdx = opcode & 0b111; // 下位3ビットで対象レジスタを取得
      const val = this.getRegisterByIndex(regIdx);

      this.a &= val; // A = A & val

      // フラグの更新
      this.zf = this.a === 0;
      this.nf = false;
      this.hf = true; // AND命令は必ずHフラグが立つ
      this.cf = false;

      // [HL] (インデックス6) の時だけメモリアクセスがあるので8サイクル、他は4サイクル
      this.cycles += regIdx === 6 ? 8 : 4;
      return;
    }

    // XOR A, r8 (A レジスタと排他的論理和をとる)
    // 0xA8 ~ 0xAF
    if (0xa8 <= opcode && opcode <= 0xaf) {
      const regIdx = opcode & 0b111; // 下位3ビットで対象レジスタを取得
      const val = this.getRegisterByIndex(regIdx);

      this.a ^= val; // A = A ^ val

      // フラグの更新
      this.zf = this.a === 0;
      this.nf = false;
      this.hf = false;
      this.cf = false;

      // [HL] (インデックス6) の時だけメモリアクセスがあるので8サイクル、他は4サイクル
      this.cycles += regIdx === 6 ? 8 : 4;
      return;
    }

    // OR A, r8 (A レジスタと論理和をとる)
    // 0xB0 ~ 0xB7
    if (0xb0 <= opcode && opcode <= 0xb7) {
      const regIdx = opcode & 0b111;
      const val = this.getRegisterByIndex(regIdx);

      this.a |= val; // A = A | val

      // フラグの更新 (XORと全く同じ！)
      this.zf = this.a === 0;
      this.nf = false;
      this.hf = false;
      this.cf = false;

      this.cycles += regIdx === 6 ? 8 : 4;
      return;
    }

    // CP A, r8
    // 0xB8 ~ 0xBF
    if (0xb8 <= opcode && opcode <= 0xbf) {
      const regIdx = opcode & 0b111;
      const val = this.getRegisterByIndex(regIdx);
      this.cp(val);

      this.cycles += regIdx === 6 ? 8 : 4;
      return;
    }

    // INC r8 (8bitレジスタのインクリメント)
    // 0x04, 0x0C, 0x14, 0x1C, 0x24, 0x2C, 0x34, 0x3C
    if ((opcode & 0xc7) === 0x04) {
      const regIdx = (opcode >> 3) & 0b111;
      const val = this.getRegisterByIndex(regIdx);
      const res = this.inc8(val);
      this.setRegisterByIndex(regIdx, res);

      // レジスタ指定が6（[HL]）の場合はメモリアクセスが発生するので12サイクル、他は4サイクル
      this.cycles += regIdx === 6 ? 12 : 4;
      return;
    }

    // DEC r8 (8bitレジスタのデクリメント)
    // 0x05, 0x0D, 0x15, 0x1D, 0x25, 0x2D, 0x35, 0x3D
    if ((opcode & 0xc7) === 0x05) {
      const regIdx = (opcode >> 3) & 0b111;
      const val = this.getRegisterByIndex(regIdx);
      const res = this.dec8(val);
      this.setRegisterByIndex(regIdx, res);

      this.cycles += regIdx === 6 ? 12 : 4;
      return;
    }

    // ADD A, r8
    if (0x80 <= opcode && opcode <= 0x87) {
      const regIdx = opcode & 0b111;
      const val = this.getRegisterByIndex(regIdx);
      const res = this.a + val;
      this.updateAddFlags(this.a, val, res);
      this.a = res & 0xff;

      this.cycles += regIdx === 6 ? 8 : 4;
      return;
    }

    // ADC A, r8
    if (0x88 <= opcode && opcode <= 0x8f) {
      const regIdx = opcode & 0b111;
      this.adc(this.getRegisterByIndex(regIdx));
      this.cycles += regIdx === 6 ? 8 : 4;
      return;
    }

    // SUB A, r8
    if (0x90 <= opcode && opcode <= 0x97) {
      const regIdx = opcode & 0b111;
      const val = this.getRegisterByIndex(regIdx);

      this.sub(val);

      this.cycles += regIdx === 6 ? 8 : 4;
      return;
    }

    // SBC A, r8
    if (0x98 <= opcode && opcode <= 0x9f) {
      const regIdx = opcode & 0b111;
      this.sbc(this.getRegisterByIndex(regIdx));
      this.cycles += regIdx === 6 ? 8 : 4;
      return;
    }

    switch (opcode) {
      case 0x00: // NOP
        this.cycles += 4;
        break;

      // JR i8 (無条件の相対ジャンプ)
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

      // AND A, n (Aレジスタと8ビット即値の論理積)
      case 0xe6: {
        const val = this.fetch(); // 1バイトの即値を読み込む
        this.a &= val; // A = A & val

        // フラグの更新 (ANDのルールに直従う)
        this.zf = this.a === 0;
        this.nf = false;
        this.hf = true; // AND命令は必ずHフラグが立つ
        this.cf = false;

        this.cycles += 8; // オペコード(4) + 即値読み込み(4)
        break;
      }

      // LD [u16], A (Aの値を16ビット即値アドレスに書き込む)
      case 0xea: {
        const address = this.getAddress();

        this.write(address, this.a);
        this.cycles += 16;
        break;
      }

      // XOR A, n (Aレジスタと8ビット即値の排他的論理和)
      case 0xee: {
        const val = this.fetch();
        this.a ^= val;

        this.zf = this.a === 0;
        this.nf = false;
        this.hf = false;
        this.cf = false;

        this.cycles += 8;
        break;
      }

      // LD A, (FF00+u8) (アドレスFF00+u8の値をレジスタAに書き込む)
      case 0xf0: {
        const offset = this.fetch(); // 1バイト（オフセット）を読み込む
        this.a = this.read(0xff00 + offset);
        this.cycles += 12;
        break;
      }

      // LD A, (FF00+C) (アドレスFF00+Cの値をレジスタAに書き込む)
      case 0xf2: {
        this.a = this.read(0xff00 + this.c);
        this.cycles += 8;
        break;
      }

      // DI (Disable Interrupts)
      case 0xf3: {
        this.ime = false;
        this.cycles += 4;
        break;
      }

      // OR A, n (Aレジスタと8ビット即値の論理和)
      case 0xf6: {
        const val = this.fetch();
        this.a |= val;

        this.zf = this.a === 0;
        this.nf = false;
        this.hf = false;
        this.cf = false;

        this.cycles += 8;
        break;
      }

      // LD A, [u16] (16ビット即値アドレスの値をAに読み込む)
      case 0xfa: {
        const address = this.getAddress();
        this.a = this.read(address);
        this.cycles += 16;
        break;
      }

      // EI (Enable Interrupts)
      case 0xfb: {
        this.ime = true;
        this.cycles += 4;
        break;
      }

      // PUSH 関連
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
      case 0xe5: {
        this.push(this.hl);
        this.cycles += 16;
        break;
      }
      case 0xf5: {
        this.push((this.a << 8) | this.f);
        this.cycles += 16;
        break;
      }

      // POP 関連
      case 0xc1: {
        this.bc = this.pop();
        this.cycles += 12;
        break;
      }
      case 0xd1: {
        this.de = this.pop();
        this.cycles += 12;
        break;
      }
      case 0xe1: {
        this.hl = this.pop();
        this.cycles += 12;
        break;
      }
      case 0xf1: {
        const val = this.pop();
        this.a = (val >> 8) & 0xff; // 上位8ビットを A へ
        this.f = val & 0xf0; // 下位8ビットを F へ（ただし下位4ビットは必ず0にする）
        this.cycles += 12;
        break;
      }

      // INC r16 (16ビットインクリメント)
      case 0x03: {
        this.bc = (this.bc + 1) & 0xffff;
        this.cycles += 8;
        break;
      }
      case 0x13: {
        this.de = (this.de + 1) & 0xffff;
        this.cycles += 8;
        break;
      }
      case 0x23: {
        this.hl = (this.hl + 1) & 0xffff;
        this.cycles += 8;
        break;
      }
      case 0x33: {
        this.sp = (this.sp + 1) & 0xffff;
        this.cycles += 8;
        break;
      }

      // DEC r16 (16ビットデクリメント)
      case 0x0b: {
        this.bc = (this.bc - 1) & 0xffff;
        this.cycles += 8;
        break;
      }
      case 0x1b: {
        this.de = (this.de - 1) & 0xffff;
        this.cycles += 8;
        break;
      }
      case 0x2b: {
        this.hl = (this.hl - 1) & 0xffff;
        this.cycles += 8;
        break;
      }
      case 0x3b: {
        this.sp = (this.sp - 1) & 0xffff;
        this.cycles += 8;
        break;
      }

      // CP n (Aレジスタと8ビット即値の比較)
      case 0xfe: {
        const val = this.fetch(); // 1バイト読み込む
        this.cp(val); // 比較してフラグを更新
        this.cycles += 8; // オペコード(4) + 即値読み込み(4)
        break;
      }

      // CALL cc, u16 (条件付きCALL)
      // 0xC4 (NZ), 0xCC (Z), 0xD4 (NC), 0xDC (C)
      case 0xc4:
      case 0xcc:
      case 0xd4:
      case 0xdc: {
        const condition = (opcode >> 3) & 0b11; // 0:NZ, 1:Z, 2:NC, 3:C
        const address = this.getAddress();
        const isConditionMet = this.jumpCheckCondition(condition);

        if (isConditionMet) {
          this.push(this.pc); // 条件を満たしたら現在のPCをスタックに退避
          this.pc = address; // ジャンプ
          this.cycles += 24; // 条件成立時は CALL と同じ 24 サイクル
        } else {
          this.cycles += 12; // 条件不成立時はアドレスを読んだだけで終わるので 12 サイクル
        }
        break;
      }

      // SUB A, n (Aレジスタから8bit即値を引く)
      case 0xd6: {
        const value = this.fetch();
        this.sub(value);
        this.cycles += 8;
        break;
      }

      // ADC A, n (即値のキャリー付き加算)
      case 0xce: {
        this.adc(this.fetch());
        this.cycles += 8;
        break;
      }

      // SBC A, n (即値のキャリー付き減算)
      case 0xde: {
        this.sbc(this.fetch());
        this.cycles += 8;
        break;
      }

      // CBプレフィックス
      case 0xcb: {
        const cbOpcode = this.fetch();
        this.executeCB(cbOpcode);
        break;
      }

      // RRA
      // CB 0x1FをAレジスタのみに対して行う
      // ゼロフラグが常に0(false)になることに注意！これがCB 0x1Fとの違い
      case 0x1f: {
        // シフト前キャリーフラグ退避
        const oldCarry = this.cf ? 1 : 0;

        // 押し出される一番右のビットをキャリーフラグに保存(ここでキャリーフラグが更新)
        this.cf = (this.a & 0x01) === 1;
        // 1bit 右にシフト
        // JSだと >> は算術シフト(一番上の符号ビットを保持する)になってしまうので、論理シフトは>>>を使う
        this.a = (this.a >>> 1) | (oldCarry << 7);

        // 残りのフラグ更新
        this.zf = false;
        this.nf = false;
        this.hf = false;

        this.cycles += 4;

        break;
      }

      // RET cc
      // 条件を満たした時だけ pop() して pc を更新する
      case 0xc0:
      case 0xc8:
      case 0xd0:
      case 0xd8: {
        const condition = (opcode >> 3) & 0b11; // 0:NZ, 1:Z, 10:NC, 11:C
        const isConditionMet = this.jumpCheckCondition(condition);

        if (isConditionMet) {
          this.pc = this.pop(); // スタックからアドレスを戻す
          this.cycles += 20; // 条件成立時は20サイクル
        } else {
          this.cycles += 8; // 条件不成立時は8サイクル
        }
        break;
      }

      // ADD HL, r16
      case 0x09: {
        this.addHL(this.bc);
        this.cycles += 8;
        break;
      }
      case 0x19: {
        this.addHL(this.de);
        this.cycles += 8;
        break;
      }
      case 0x29: {
        this.addHL(this.hl);
        this.cycles += 8;
        break;
      }
      case 0x39: {
        this.addHL(this.sp);
        this.cycles += 8;
        break;
      }

      // ADD SP, r8
      // スタックポインター自身に符号付き8ビット値を足す
      case 0xe8: {
        const unsignedOffset = this.fetch();
        let signedOffset = unsignedOffset;
        if (signedOffset > 127) {
          signedOffset -= 256;
        }

        // HとCフラグの計算 (0xF8と全く同じ)
        this.hf = (this.sp & 0x0f) + (unsignedOffset & 0x0f) > 0x0f;
        this.cf = (this.sp & 0xff) + unsignedOffset > 0xff;
        this.zf = false;
        this.nf = false;

        // SP自身を更新 (16ビット)
        this.sp = (this.sp + signedOffset) & 0xffff;

        this.cycles += 16; // こっちは16サイクルかかる
        break;
      }

      // LD HL, SP+r8
      // スタックポインター（SP）に符号付き8ビット値を足した結果を、HLレジスタに格納する
      case 0xf8: {
        const unsignedOffset = this.fetch(); // まずは符号なし(0~255)として取得

        // 符号付き8ビット整数 (-128 〜 127) に変換する
        let signedOffset = unsignedOffset;
        if (signedOffset > 127) {
          signedOffset -= 256;
        }

        this.hl = (this.sp + signedOffset) & 0xffff;

        this.zf = false;
        this.nf = false;
        this.hf = (this.sp & 0x0f) + (unsignedOffset & 0x0f) > 0x0f;
        this.cf = this.sp + unsignedOffset > 0xff;

        this.cycles += 12;

        break;
      }

      // DAA
      case 0x27: {
        let adjustment = 0;

        // Hフラグが立っている、あるいは下位4ビットが9を超えている
        if (this.hf || (!this.nf && (this.a & 0x0f) > 9)) {
          adjustment |= 0x06;
        }

        // Cフラグが立っている、あるいは上位4ビットが9を超えている
        if (this.cf || (!this.nf && this.a > 0x99)) {
          adjustment |= 0x60;
          this.cf = true;
        }

        // 減算か加算かで調整値を適用
        if (this.nf) {
          this.a = (this.a - adjustment) & 0xff;
        } else {
          this.a = (this.a + adjustment) & 0xff;
        }

        // フラグ更新
        this.zf = this.a === 0;
        this.hf = false; // Hフラグは強制的に 0 になる

        this.cycles += 4;

        break;
      }

      // LD SP, HL (HLの値をSPにコピー)
      case 0xf9: {
        this.sp = this.hl;
        this.cycles += 8;
        break;
      }

      // RLCA (Rotate A Left Circular)
      // 注意: Zフラグは常に false にする！
      case 0x07: {
        const bitSeven = (this.a >> 7) & 0x01;
        this.cf = bitSeven === 1; // 押し出されたビットはキャリーにも入る

        // 左に1bitシフトし、空いた一番下(bit 0)に「ハミ出たbit 7」を戻す
        this.a = ((this.a << 1) | bitSeven) & 0xff;

        this.zf = false; // 強制的に false
        this.nf = false;
        this.hf = false;

        this.cycles += 4;
        break;
      }

      // STOP (0x10)
      // 次の1バイトを読み飛ばして待機状態に入る
      case 0x10: {
        this.fetch(); // 次のバイトを読み飛ばす
        this.cycles += 4;
        break;
      }

      // LD (u16), SP
      case 0x08: {
        const address = this.getAddress(); // 16bitのアドレスを読み込む
        this.write(address, this.sp & 0xff); // 下位バイト
        this.write(address + 1, (this.sp >> 8) & 0xff); // 上位バイト
        this.cycles += 20;
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

  // CBプレフィックス専用の実行メソッド
  executeCB(cbOpcode: number) {
    const regIdx = cbOpcode & 0b111; // 下位3ビット: 対象レジスタ (0~7)
    const bitIdx = (cbOpcode >> 3) & 0b111; // 中位3ビット: 対象ビット位置 (0~7)
    const category = (cbOpcode >> 6) & 0b11; // 上位2ビット: 命令のカテゴリ (0~3)

    // 対象のレジスタ（またはメモリ[HL]）から値を取得
    const val = this.getRegisterByIndex(regIdx);

    // カテゴリ1: BIT b, r (指定ビットのテスト)
    // 指定されたビットが「0」ならZフラグを立てる
    if (category === 1) {
      const isZero = (val & (1 << bitIdx)) === 0;

      this.zf = isZero;
      this.nf = false;
      this.hf = true;
      // cf は変更しない

      // サイクル数の加算: メモリ[HL](インデックス6)は12サイクル、レジスタは8サイクル
      this.cycles += regIdx === 6 ? 12 : 8;
      return;
    }

    // RL
    // ①左に1bit論理シフト
    // → ②古いキャリーフラグの値を最下位ビット(ビット0)に押し込む(JS/TSだとはみ出したビットを切り落とすために & 0xffするのに注意！)
    // → ③ ①で左に溢れたビットの値を新しいキャリーフラグの値として更新
    // 0x10 ~ 0x17
    if (0x10 <= cbOpcode && cbOpcode <= 0x17) {
      const oldCarry = this.cf ? 1 : 0;

      // 押し出される一番左のビットをキャリーフラグに保存(ここでキャリーフラグが更新)
      this.cf = ((val >> 7) & 0x01) === 1;

      // 1bit 左にシフト
      const result = ((val << 1) | oldCarry) & 0xff;
      this.setRegisterByIndex(regIdx, result);

      // 残りのフラグ更新
      this.zf = result === 0;
      this.nf = false;
      this.hf = false;

      // メモリ[HL](インデックス6)は16サイクル、レジスタは8サイクル
      this.cycles += regIdx === 6 ? 16 : 8;
      return;
    }

    // RR
    // キャリーフラグを巻き込んで右へ1ビットローテート（回転）させる
    // ①右に1bit論理シフト
    // → ②古いキャリーフラグの値を最上位ビット(ビット7)に押し込む
    // → ③ ①で右に溢れたビットの値を新しいキャリーフラグの値として更新
    // RRC命令との違いに注意！
    // 0x18 ~ 0x1F
    if (0x18 <= cbOpcode && cbOpcode <= 0x1f) {
      // まず「シフトする前の古いキャリーフラグ」を 1 か 0 で保存しておく
      const oldCarry = this.cf ? 1 : 0;

      // 押し出される一番右のビットをキャリーフラグに保存(ここでキャリーフラグが更新)
      this.cf = (val & 0x01) === 1;
      // 1bit 右にシフト
      // JSだと >> は算術シフト(一番上の符号ビットを保持する)になってしまうので、論理シフトは>>>を使う
      const result = (val >>> 1) | (oldCarry << 7);
      this.setRegisterByIndex(regIdx, result);

      // 残りのフラグ更新
      this.zf = result === 0;
      this.nf = false;
      this.hf = false;

      // メモリ[HL](インデックス6)は16サイクル、レジスタは8サイクル
      this.cycles += regIdx === 6 ? 16 : 8;
      return;
    }

    // SWAP
    // 指定されたレジスタまたはメモリ上の8ビットデータの上位4ビットと下位4ビットを交換する
    // 0x30 ~ 0x37
    if (0x30 <= cbOpcode && cbOpcode <= 0x37) {
      const low = val & 0x0f;
      const high = val & 0xf0;
      const result = (low << 4) | (high >>> 4);
      this.setRegisterByIndex(regIdx, result);

      this.zf = result === 0;
      this.nf = false;
      this.hf = false;
      this.cf = false;

      // メモリ[HL](インデックス6)は16サイクル、レジスタは8サイクル
      this.cycles += regIdx === 6 ? 16 : 8;
      return;
    }

    // SRL (Shift Right Logical)
    // 指定されたレジスタまたはメモリ上の8ビットデータを右へ1ビット論理シフトする
    // 0x38 ~ 0x3F
    if (0x38 <= cbOpcode && cbOpcode <= 0x3f) {
      // 押し出される一番右のビットをキャリーフラグに保存
      this.cf = (val & 0x01) === 1;

      // 1bit 右にシフト
      // JSだと >> は算術シフト(一番上の符号ビットを保持する)になってしまうので、論理シフトは>>>を使う
      const result = val >>> 1;
      this.setRegisterByIndex(regIdx, result);

      // 残りのフラグ更新
      this.zf = result === 0;
      this.nf = false;
      this.hf = false;

      // メモリ[HL](インデックス6)は16サイクル、レジスタは8サイクル
      this.cycles += regIdx === 6 ? 16 : 8;
      return;
    }

    // まだ実装していないCB命令が来た場合のエラーハンドリング
    console.error(
      `未実装のCB命令です: 0xCB 0x${cbOpcode.toString(16).padStart(2, '0')} (PC: 0x${(this.pc - 2).toString(16).padStart(4, '0')})`,
    );
    throw new Error('Not Implemented CB Opcode');
  }

  logState() {
    const opcode = this.read(this.pc);
    console.log(
      `PC: ${this.pc.toString(16).padStart(4, '0')} | ` +
        `Opcode: ${opcode.toString(16)} |` +
        `AF: ${((this.a << 8) | this.f).toString(16).padStart(4, '0')} | ` +
        `BC: ${((this.b << 8) | this.c).toString(16).padStart(4, '0')} | ` +
        `HL: ${this.hl.toString(16).padStart(4, '0')} | ` +
        `CYC: ${this.cycles} | ` +
        ` Memory: ${this.read(this.sp)}`,
    );
    if (this.pc === 0xc003) {
      console.log(`詳細デバッグ: A=${this.a}, CF=${this.cf}`);
    }
  }
}
