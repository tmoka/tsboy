export class BUS {
  memory = new Uint8Array(0x10000);

  read8(addr: number): number {
    // ここで 0xFF00 なら Joypad クラスを呼ぶ、などの振り分けをする
    return this.memory[addr & 0xffff];
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
