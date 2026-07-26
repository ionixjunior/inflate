import { describe, expect, it } from 'vitest';
import { PHASE_PREPARING_ENGINE, PHASE_RENDERING, PHASE_STARTING_HOST, preparingEnginePhase } from './loadingPhases';

describe('loading phase labels (fix-pack POLISH-02, FP-1 AC1)', () => {
  it('has the exact three phase strings the spec names', () => {
    expect(PHASE_PREPARING_ENGINE).toBe('Preparing render engine…');
    expect(PHASE_STARTING_HOST).toBe('Starting render host…');
    expect(PHASE_RENDERING).toBe('Rendering…');
  });

  it('appends the artifact key with no percent when totalBytes is unknown', () => {
    expect(preparingEnginePhase('layoutlib.jar')).toBe('Preparing render engine… layoutlib.jar');
  });

  it('appends the artifact key and percent once a download is in progress', () => {
    expect(preparingEnginePhase('layoutlib.jar', 42)).toBe('Preparing render engine… layoutlib.jar 42%');
  });
});
