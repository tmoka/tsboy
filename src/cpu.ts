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

  memory: Uint8Array = new Uint8Array(0x10000); // 64KB

  cycles: number = 0;

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
  }

  getCycles() {
    return this.cycles;
  }

  execute(opcode: number) {
    // 0x40 ~ 0x7F (ただし 0x76 HALT を除く) は LD r, r
    if (0x40 <= opcode && opcode <= 0x7f && opcode !== 0x76) {
      const srcIdx = opcode & 0b111;
      const destIdx = (opcode >> 3) & 0b111;

      const value = this.getRegisterByIndex(srcIdx);
      this.setRegisterByIndex(destIdx, value);

      this.cycles += srcIdx === 6 || destIdx === 6 ? 8 : 4;
      return;
    }
    switch (opcode) {
      case 0x00: // NOP
        this.cycles += 4;
        break;
      case 0x3f: // CCF
        this.executeCCF();
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
}
