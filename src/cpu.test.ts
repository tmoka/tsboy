import { describe, it, expect, beforeEach } from 'vitest';
import { CPU } from './cpu.ts'; // ファイル名は適宜合わせてください

describe('CPU', () => {
  let cpu: CPU;

  beforeEach(() => {
    cpu = new CPU();
    // テストごとにPCを初期化
    cpu.pc = 0x0100;
    // テストごとにサイクル数を初期化
  });

  it('NOP (0x00) で PC が 1 進むこと', () => {
    cpu.memory[0x0100] = 0x00; // NOP
    cpu.step();

    expect(cpu.pc).toBe(0x0101);
  });

  it('NOP(0x00) で cycles が 4 進むこと', () => {
    cpu.memory[0x0100] = 0x00; // NOP
    cpu.step();

    expect(cpu.cycles).toBe(4);
  });

  it('LD B, A (0x47) で A の値が B にコピーされること', () => {
    cpu.a = 0x55;
    cpu.memory[0x0100] = 0x47; // LD B, A
    cpu.step();

    expect(cpu.b).toBe(0x55);
    expect(cpu.pc).toBe(0x0101);
    expect(cpu.cycles).toBe(4);
  });

  it('CCF (0x3F) でキャリーフラグが反転すること', () => {
    cpu.memory[0x0100] = 0x3f; // CCF

    // 最初が 0 の場合 -> 1 になる
    cpu.f = 0b00000000;
    cpu.step();
    expect(cpu.f & 0x10).toBe(0x10); // Cフラグが立っているか

    // 次に 1 の場合 -> 0 になる
    cpu.pc = 0x0100; // 同じ命令をもう一度
    cpu.step();
    expect(cpu.f & 0x10).toBe(0x00); // Cフラグが落ちているか
  });
});
