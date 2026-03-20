import { CPU } from './cpu.ts';

test('LD B, C (0x41) のテスト', () => {
  const cpu = new CPU();
  cpu.c = 0xaa;
  cpu.memory[0x0100] = 0x41; // LD B, C

  cpu.step();

  expect(cpu.b).toBe(0xaa);
  expect(cpu.pc).toBe(0x0101);
});

test('LD B, (HL) (0x46) のテスト', () => {
  const cpu = new CPU();
  cpu.hl = 0xc000;
  cpu.memory[0xc000] = 0x55; // メモリ上の値
  cpu.memory[0x0100] = 0x46; // LD B, (HL)

  cpu.step();

  expect(cpu.b).toBe(0x55);
});
