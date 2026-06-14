export class BUS {
  memory = new Uint8Array(0x10000);

  read8(addr: number): number {
    const address = addr & 0xffff;

    // もしI/Oポートを読もうとしたら、0〜255のランダムな「整数」を返す（テスト用ハック）
    // これにより、VBlank待ち (0xFF44) などのループを確率で突破できる
    if (0xff00 <= address && address <= 0xff7f) {
      return Math.floor(Math.random() * 256);
    }

    return this.memory[address] ?? 0;
  }

  write8(addr: number, value: number) {
    const a = addr & 0xffff;

    // テストROMの出力（シリアル通信）を傍受する
    if (a === 0xff01) {
      console.log(`[SERIAL]: ${String.fromCharCode(value)}`);
    }

    this.memory[a] = value;
  }
}
