import { expect } from '@playwright/test';
import { cliTest } from '../../fixtures/cli.fixture';

cliTest.describe('CLI Get/Search', () => {
  cliTest('should handle complete search workflow', async ({ cliPage }) => {
    // Setup: Configure and login
    await cliPage.configure();
    await cliPage.login('testuser', 'testuser');
    
    // Step 1: Search sequences with basic filters using real organism
    const basicSearchResult = await cliPage.getSequences({
      organism: 'west-nile',
      limit: 5,
      format: 'json'
    });
    expect(basicSearchResult.exitCode).toBe(0);
    
    // Step 2: Get sequences with location filter
    const locationFilterResult = await cliPage.getSequences({
      organism: 'west-nile',
      filters: ['geoLocCountry=USA'],
      limit: 3,
      format: 'json'
    });
    expect(locationFilterResult.exitCode).toBe(0);
    
    // Step 3: Get sequences with basic limit (skip date filter for now)
    const limitFilterResult = await cliPage.getSequences({
      organism: 'west-nile',
      limit: 2,
      format: 'json'
    });
    expect(limitFilterResult.exitCode).toBe(0);
    
    // Step 4: Test different output formats
    // JSON format
    const jsonResult = await cliPage.getSequences({
      organism: 'west-nile',
      limit: 1,
      format: 'json'
    });
    expect(jsonResult.exitCode).toBe(0);
    
    // TSV format
    const tsvResult = await cliPage.getSequences({
      organism: 'west-nile',
      limit: 1,
      format: 'tsv'
    });
    expect(tsvResult.exitCode).toBe(0);
    
    // Step 5: Handle no results gracefully
    const noResultsResult = await cliPage.getSequences({
      organism: 'west-nile',
      filters: ['geoLocCountry=NonexistentLocation99999'],
      limit: 10
    });
    expect(noResultsResult.exitCode).toBe(0);
    
    // Step 6: Handle invalid organism gracefully
    const invalidOrganismResult = await cliPage.getSequences({
      organism: 'invalid-organism-name-xyz',
      limit: 1
    });
    expect(invalidOrganismResult.exitCode).not.toBe(0);
    expect(invalidOrganismResult.stderr).toMatch(/LAPIS not available|failed|not found/);
  });
});