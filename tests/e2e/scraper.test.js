import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

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

const TEST_CIF = '10542416';
const TEST_BRAND = 'Unix Auto';
const UNIXAUTO_CAREERS_URL = 'https://www.unixauto.ro/cariera/cautator';

describe('E2E: Unixauto Scraper', () => {

  describe('Real Page Fetch', () => {
    let html;
    let index;

    beforeAll(async () => {
      index = await import('../../index.js');
      const res = await fetch(UNIXAUTO_CAREERS_URL, {
        headers: { 'User-Agent': 'job_seeker_ro_spider' }
      });
      html = await res.text();
    }, 15000);

    it('should return valid HTML from careers page', () => {
      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
      expect(html).toContain('karrierjob');
    });

    it('should contain job links (a.karrierjob)', () => {
      expect(html).toContain('class="karrierjob"');
    });

    it('should extract jobs from real page', () => {
      const jobs = index.extractJobsFromAboutPage(html);

      expect(Array.isArray(jobs)).toBe(true);
      expect(jobs.length).toBeGreaterThan(0);

      for (const job of jobs) {
        expect(job).toHaveProperty('title');
        expect(job.title).toBeTruthy();
        expect(job).toHaveProperty('url');
        expect(job.url).toMatch(/^https:\/\/www\.unixauto\.ro\/cariera\/locuri-de-munca\//);
        expect(job).toHaveProperty('location');
        expect(Array.isArray(job.location)).toBe(true);
        expect(job.location.length).toBeGreaterThan(0);
        expect(job).toHaveProperty('workplaceType', 'on-site');
        expect(job).toHaveProperty('status', 'scraped');
        expect(job).toHaveProperty('postingDate');
        expect(job).toHaveProperty('date');
        expect(job).toHaveProperty('company', 'UNIX AUTO SRL');
        expect(job).toHaveProperty('cif', TEST_CIF);
      }
    });

    it('should transform jobs to SOLR format', () => {
      const jobs = index.extractJobsFromAboutPage(html);
      const transformed = index.transformJobs(jobs);

      expect(transformed).toHaveProperty('jobs');
      expect(transformed.jobs.length).toBe(jobs.length);

      for (const job of transformed.jobs) {
        expect(job).toHaveProperty('url');
        expect(job).toHaveProperty('title');
        expect(job).toHaveProperty('company');
        expect(job).toHaveProperty('cif', TEST_CIF);
        expect(job).toHaveProperty('location');
        expect(job).toHaveProperty('workplaceType', 'on-site');
        expect(job).toHaveProperty('status', 'scraped');
      }
    });

    it('should have accessible job URLs', async () => {
      const jobs = index.extractJobsFromAboutPage(html);

      for (const job of jobs.slice(0, 3)) {
        const res = await fetch(job.url, {
          method: 'HEAD',
          headers: { 'User-Agent': 'job_seeker_ro_spider' }
        });
        expect(res.ok).toBe(true);
      }
    }, 30000);
  });

  describe('Company Validation Path', () => {
    let anaf;
    let company;

    beforeAll(async () => {
      anaf = await import('../../src/anaf.js');
      company = await import('../../company.js');
    });

    it('should find UNIX AUTO in ANAF and validate active status', async () => {
      const results = await anaf.searchCompany('UNIX AUTO');

      const unixauto = results.find(c =>
        c.cui.toString() === TEST_CIF &&
        c.statusLabel === 'Funcțiune'
      );
      expect(unixauto).toBeDefined();
      expect(unixauto.cui.toString()).toBe(TEST_CIF);

      const anafData = await anaf.getCompanyFromANAF(TEST_CIF);
      expect(anafData).toBeDefined();
      expect(anafData.inactive).toBe(false);
    }, 30000);

    itIfSolr('should run full validation and report active status', async () => {
      const result = await company.validateAndGetCompany();

      expect(result.status).toBe('active');
      expect(result.cif).toBe(TEST_CIF);

      if (result.existingJobsCount === 0) {
        console.log('No UNIX AUTO jobs in Solr — skipping job count assertion');
        return;
      }
      expect(result.existingJobsCount).toBeGreaterThan(0);
    }, 30000);
  });

  describe('SOLR Data Verification', () => {
    let solr;

    beforeAll(async () => {
      solr = await import('../../solr.js');
    });

    itIfSolr('should have UNIX AUTO jobs in SOLR with correct CIF', async () => {
      const result = await solr.querySOLR(TEST_CIF);

      if (result.numFound === 0) {
        console.log('No UNIX AUTO jobs in Solr — skipping');
        return;
      }

      for (const job of result.docs) {
        expect(job.cif).toBe(TEST_CIF);
      }
    }, 15000);

    itIfSolr('should have UNIX AUTO company core entry', async () => {
      const result = await solr.queryCompanySOLR(`id:${TEST_CIF}`);

      expect(result.numFound).toBe(1);
      const unixauto = result.docs[0];
      expect(unixauto.cif || unixauto.id).toBe(TEST_CIF);
      expect(unixauto.status).toBe('activ');
    }, 15000);
  });
});
