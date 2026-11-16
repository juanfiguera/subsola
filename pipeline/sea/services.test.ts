import { describe, expect, it } from 'vitest';
import { formatPin, seaServiceLine, seaServicePiece, serviceSizeIn } from './services';

describe('seaServicePiece', () => {
  it('names the pipe from the code', () => {
    expect(seaServicePiece('CU')).toEqual({
      material: 'non-lead',
      verified: false,
      pipe: 'Copper',
    });
    expect(seaServicePiece('CS').pipe).toBe('Copper');
    expect(seaServicePiece('GI')).toEqual({
      material: 'galvanized',
      verified: false,
      pipe: 'Galvanized iron',
    });
    expect(seaServicePiece('GS').material).toBe('galvanized');
  });

  it('reads PB as polybutylene, not lead', () => {
    expect(seaServicePiece('PB')).toEqual({
      material: 'non-lead',
      verified: false,
      pipe: 'Polybutylene',
    });
  });

  it('leaves blank, UNK and pipe that may be galvanized unknown', () => {
    expect(seaServicePiece('UNK').material).toBe('unknown');
    expect(seaServicePiece('').pipe).toBe('Not recorded');
    expect(seaServicePiece(undefined).material).toBe('unknown');
    expect(seaServicePiece('SP')).toEqual({
      material: 'unknown',
      verified: false,
      pipe: 'Screw pipe',
    });
  });
});

describe('seaServiceLine', () => {
  it('reads main to meter, then meter to union', () => {
    const line = seaServiceLine('PL/CU');
    expect(line.publicSide.pipe).toBe('Plastic');
    expect(line.privateSide.pipe).toBe('Copper');
    expect(line.material).toBe('non-lead');
  });

  it('takes the worse piece', () => {
    expect(seaServiceLine('GI/CU').material).toBe('galvanized');
    expect(seaServiceLine('CU/GS').material).toBe('galvanized');
    expect(seaServiceLine('CU/UNK').material).toBe('unknown');
    expect(seaServiceLine('/').material).toBe('unknown');
    expect(seaServiceLine(null).material).toBe('unknown');
  });
});

describe('formatPin', () => {
  it("writes King County's major and minor", () => {
    expect(formatPin('2872100365')).toBe('287210-0365');
    expect(formatPin('123')).toBe('123');
  });
});

describe('serviceSizeIn', () => {
  it('reads the text size, and drops blanks and nonsense', () => {
    expect(serviceSizeIn('0.75')).toBe(0.75);
    expect(serviceSizeIn('2')).toBe(2);
    expect(serviceSizeIn(null)).toBeNull();
    expect(serviceSizeIn('0')).toBeNull();
    expect(serviceSizeIn('400')).toBeNull();
  });
});
