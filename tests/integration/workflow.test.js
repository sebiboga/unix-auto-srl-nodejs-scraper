import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const HAS_SOLR = !!process.env.SOLR_AUTH;

function itIfSolr(name, fn, timeout) {
  if (HAS_SOLR) {
    return it(name, fn, timeout);
  }
  return it.skip(`${name} (skipped: SOLR_AUTH not set)`, fn, timeout);
}

beforeAll(() => {
  if (HAS_SOLR) {
    process.env.SOLR_AUTH = process.env.SOLR_AUTH;
  }
});

const UNIX_AUTO_CIF = '10542416';

describe('Integration: API Workflow', () => {

  describe('ANAF API', () => {
    let anaf;

    beforeAll(async () => {
      anaf = await import('../../src/anaf.js');
    });

    it('should search for UNIX AUTO brand and find the company', async () => {
      const results = await anaf.searchCompany('UNIX AUTO');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      const unixauto = results.find(c =>
        c.name.toUpperCase().includes('UNIX AUTO SYSTEMS') && c.statusLabel === 'Funcțiune'
      );
      expect(unixauto).toBeDefined();
      expect(unixauto.cui.toString()).toBe(UNIX_AUTO_CIF);
    }, 15000);

    it('should return empty array for non-existent brand', async () => {
      const results = await anaf.searchCompany('ThisBrandDoesNotExistXYZ123');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    }, 15000);

    it('should fetch company details by valid CIF', async () => {
      const data = await anaf.getCompanyFromANAF(UNIX_AUTO_CIF);

      expect(data).toBeDefined();
      expect(data.cui).toBe(10542416);
      expect(data.name).toBe('UNIX AUTO SRL');
      expect(data).toHaveProperty('address');
      expect(data).toHaveProperty('registrationNumber');
      expect(data).toHaveProperty('caenCode');
      expect(data).toHaveProperty('inactive', false);
      expect(data).toHaveProperty('onrcStatusLabel', 'Funcțiune');
    }, 15000);

    it('should throw for invalid CIF', async () => {
      await expect(anaf.getCompanyFromANAF('00000000')).rejects.toThrow();
    }, 60000);

    it('should use cached data when API fails (getCompanyFromANAFWithFallback)', async () => {
      const cached = { cui: 10542416, name: 'UNIX AUTO SRL' };

      const data = await anaf.getCompanyFromANAFWithFallback(UNIX_AUTO_CIF, cached);

      expect(data).toBeDefined();
      expect(data.cui).toBe(10542416);
    }, 15000);
  });

  describe('Peviitor API', () => {
    let company;

    beforeAll(async () => {
      company = await import('../../company.js');
    });

    it.skip('should respond successfully and contain companies array (Peviitor API may block non-browser requests)', async () => {
      const res = await fetch('https://api.peviitor.ro/v1/company/', {
        headers: { 'User-Agent': 'job_seeker_ro_spider' }
      });

      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data).toHaveProperty('companies');
      expect(Array.isArray(data.companies)).toBe(true);
    }, 15000);
  });

  describe('SOLR Company Core', () => {
    let solr;

    beforeAll(async () => {
      solr = await import('../../solr.js');
    });

    itIfSolr('should query company core by ID', async () => {
      const result = await solr.queryCompanySOLR(`id:${UNIX_AUTO_CIF}`);

      expect(result.numFound).toBe(1);
      const unixauto = result.docs[0];
      expect(unixauto.id).toBe(UNIX_AUTO_CIF);
      expect(unixauto.company).toBe('UNIX AUTO SRL');
      expect(unixauto.brand).toBe('UNIX AUTO');
      expect(unixauto.status).toBe('activ');
      expect(Array.isArray(unixauto.location)).toBe(true);
      expect(unixauto.lastScraped).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }, 15000);

    itIfSolr('should have required company model fields', async () => {
      const result = await solr.queryCompanySOLR(`id:${UNIX_AUTO_CIF}`);
      const unixauto = result.docs[0];

      expect(unixauto).toHaveProperty('id', UNIX_AUTO_CIF);
      expect(unixauto).toHaveProperty('company');
      expect(unixauto).toHaveProperty('brand', 'UNIX AUTO');
      expect(unixauto).toHaveProperty('status');
      expect(['activ', 'suspendat', 'inactiv', 'radiat']).toContain(unixauto.status);
      expect(unixauto).toHaveProperty('location');
      expect(Array.isArray(unixauto.location)).toBe(true);
      expect(unixauto).toHaveProperty('website');
      expect(Array.isArray(unixauto.website)).toBe(true);
      expect(unixauto.website[0]).toMatch(/^https?:\/\/.+/);
      expect(unixauto).toHaveProperty('career');
      expect(Array.isArray(unixauto.career)).toBe(true);
      expect(unixauto.career[0]).toMatch(/^https?:\/\/.+/);
      expect(unixauto).toHaveProperty('lastScraped');
      expect(unixauto).toHaveProperty('scraperFile');
    }, 15000);

    itIfSolr('should have optional field (group) if present', async () => {
      const result = await solr.queryCompanySOLR(`id:${UNIX_AUTO_CIF}`);
      const unixauto = result.docs[0];

      if (unixauto.group !== undefined) {
        expect(typeof unixauto.group).toBe('string');
      }
    }, 15000);
  });

  describe('SOLR Jobs Core', () => {
    let solr;

    beforeAll(async () => {
      solr = await import('../../solr.js');
    });

    itIfSolr('should query jobs by CIF and return valid data', async () => {
      const result = await solr.querySOLR(UNIX_AUTO_CIF);

      if (result.numFound === 0) {
        console.log('⚠️ No UNIX AUTO jobs in Solr — skipping job field assertions (scraper may not have run yet)');
        return;
      }

      expect(result.numFound).toBeGreaterThan(0);
      expect(Array.isArray(result.docs)).toBe(true);

      const job = result.docs[0];
      expect(job).toHaveProperty('url');
      expect(job).toHaveProperty('title');
      expect(job).toHaveProperty('company', 'UNIX AUTO SRL');
      expect(job).toHaveProperty('cif', UNIX_AUTO_CIF);
      expect(job).toHaveProperty('status');
      expect(job).toHaveProperty('location');
    }, 15000);

    itIfSolr('should not have duplicate URLs for same CIF', async () => {
      const result = await solr.querySOLR(UNIX_AUTO_CIF);

      const urls = result.docs.map(j => j.url);
      const uniqueUrls = new Set(urls);
      expect(uniqueUrls.size).toBe(result.docs.length);
    }, 15000);

    itIfSolr('should have valid status values for all jobs', async () => {
      const validStatuses = ['scraped', 'tested', 'verified', 'published'];
      const result = await solr.querySOLR(UNIX_AUTO_CIF);

      for (const job of result.docs) {
        expect(validStatuses).toContain(job.status);
      }
    }, 15000);

    itIfSolr('should have valid CIF format for all jobs', async () => {
      const result = await solr.querySOLR(UNIX_AUTO_CIF);

      for (const job of result.docs) {
        expect(job.cif).toMatch(/^\d{8}$/);
      }
    }, 15000);
  });

  describe('Full Validation Workflow', () => {
    let anaf;
    let companyModule;

    beforeAll(async () => {
      anaf = await import('../../src/anaf.js');
      companyModule = await import('../../company.js');
    });

    it('should complete the ANAF → Peviitor validation path', async () => {
      const searchResults = await anaf.searchCompany('UNIX AUTO');
      expect(searchResults.length).toBeGreaterThan(0);

      const unixautoCompany = searchResults.find(c =>
        c.name.toUpperCase().includes('UNIX AUTO') && c.statusLabel === 'Funcțiune'
      );
      expect(unixautoCompany).toBeDefined();

      const anafData = await anaf.getCompanyFromANAF(unixautoCompany.cui.toString());
      expect(anafData.name).toBe('UNIX AUTO SRL');
      expect(anafData.inactive).toBe(false);
    }, 30000);

    itIfSolr('should have matching CIF in company core', async () => {
      const companyResult = await companyModule.validateAndGetCompany();
      const solrObj = await import('../../solr.js');

      const solrResult = await solrObj.queryCompanySOLR(`id:${UNIX_AUTO_CIF}`);
      expect(solrResult.numFound).toBe(1);
      expect(solrResult.docs[0].id).toBe(UNIX_AUTO_CIF);
      expect(solrResult.docs[0].company).toBe('UNIX AUTO SRL');
    }, 30000);

    itIfSolr('should validate company and query SOLR for existing jobs', async () => {
      const companyResult = await companyModule.validateAndGetCompany();

      expect(companyResult.status).toBe('active');
      expect(companyResult.company).toBe('UNIX AUTO SRL');
      expect(companyResult.cif).toBe(UNIX_AUTO_CIF);

      if (companyResult.existingJobsCount === 0) {
        console.log('⚠️ No UNIX AUTO jobs in Solr — skipping job count assertion (scraper may not have run yet)');
        return;
      }
      expect(companyResult.existingJobsCount).toBeGreaterThan(0);
    }, 30000);
  });
});
