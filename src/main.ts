// main.ts
import fs from 'node:fs';
import { CPU } from './cpu.ts';
import { BUS } from './bus.ts';

const bus = new BUS();
const cpu = new CPU(bus);

// テストROMを読み込む
const romBuffer = fs.readFileSync('./gb-test-roms/cpu_instrs/cpu_instrs.gb');
bus.memory.set(romBuffer, 0x0000);

cpu.pc = 0x0100;
cpu.sp = 0xfffe;

const runEmulator = (cpu: CPU) => {
  try {
    while (true) {
      cpu.step();
    }
    console.log('=== 実行終了 ===');
  } catch (e) {
    console.error('エラーが発生しました:', e);
    cpu.logState();
  }
};

runEmulator(cpu);
