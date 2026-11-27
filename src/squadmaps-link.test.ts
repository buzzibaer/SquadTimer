import { describe, expect, it } from 'vitest';
import { squadMapsUrl, squadMapsLinkMarkup } from './squadmaps-link';

describe('SquadMaps links', () => {
  it('uses source map ids and compact layer aliases for representative map names', () => {
    expect(squadMapsUrl('Anvil', 'Anvil_RAAS_v1', 'RAAS')).toBe('https://squadmaps.com/?map=Anvil&layer=RAASv1');
    expect(squadMapsUrl('Al Basrah', 'AlBasrah_RAAS_v1', 'RAAS')).toBe('https://squadmaps.com/?map=AlBasrah&layer=RAASv1');
    expect(squadMapsUrl('Kamdesh Highlands', 'Kamdesh_RAAS_v1', 'RAAS')).toBe('https://squadmaps.com/?map=Kamdesh&layer=RAASv1');
    expect(squadMapsUrl('Pacific Proving Grounds', 'PacificProvingGrounds_AAS_v1', 'AAS')).toBe('https://squadmaps.com/?map=PacificProvingGrounds&layer=AASv1');
  });

  it('declines unsupported or mismatched identifiers and escapes link attributes', () => {
    expect(squadMapsUrl('Unknown', undefined, 'RAAS')).toBeUndefined();
    expect(squadMapsUrl('Anvil', 'Wrong_RAAS_v1', 'RAAS')).toBeUndefined();
    expect(squadMapsLinkMarkup('https://squadmaps.com/?map=Anvil&layer=RAASv1')).toContain('target="_blank" rel="noopener noreferrer"');
    expect(squadMapsLinkMarkup('https://example.test/?x=" onmouseover="bad')).toBe('');
    expect(squadMapsLinkMarkup('https://squadmaps.com/?map=Anvil&layer=RAASv1%22%20onmouseover%3Dbad')).toContain('&amp;');
  });
});
