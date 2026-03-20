export class BUS {
  memory = new Uint8Array(0x10000);

  read8(addr: number): number {
    // ここで 0xFF00 なら Joypad クラスを呼ぶ、などの振り分けをする
    return this.memory[addr & 0xffff];
  }

  write8(addr: number, value: number) {
    this.memory[addr & 0xffff] = value;
  }
}
