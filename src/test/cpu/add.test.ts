import { CPU } from '../../cpu.ts';
import { describe, it, expect, beforeEach } from 'vitest';

describe('ADD A, n (0xC6)', () => {
  let cpu: CPU;

  beforeEach(() => {
    cpu = new CPU();
    cpu.pc = 0x0100;
  });

  it('基本的な加算: 0x01 + 0x02 = 0x03 (全フラグが 0)', () => {
    cpu.a = 0x01;
    cpu.memory[0x0100] = 0xc6; // ADD A, n
    cpu.memory[0x0101] = 0x02;
    cpu.step();

    expect(cpu.a).toBe(0x03);
    expect(cpu.zf).toBe(false);
    expect(cpu.nf).toBe(false);
    expect(cpu.hf).toBe(false);
    expect(cpu.cf).toBe(false);
    expect(cpu.cycles).toBe(8);
  });

  it('Zeroフラグ: 0x00 + 0x00 = 0x00 (Z=1)', () => {
    cpu.a = 0x00;
    cpu.memory[0x0100] = 0xc6;
    cpu.memory[0x0101] = 0x00;
    cpu.step();

    expect(cpu.a).toBe(0x00);
    expect(cpu.zf).toBe(true);
  });

  it('Carryフラグ: 0xFF + 0x01 = 0x00 (Z=1, C=1, H=1)', () => {
    cpu.a = 0xff;
    cpu.memory[0x0100] = 0xc6;
    cpu.memory[0x0101] = 0x01;
    cpu.step();

    expect(cpu.a).toBe(0x00);
    expect(cpu.zf).toBe(true);
    expect(cpu.cf).toBe(true);
    expect(cpu.hf).toBe(true); // 0xF + 0x1 でハーフキャリーも発生
  });
});
