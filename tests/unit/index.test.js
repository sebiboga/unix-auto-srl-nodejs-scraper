import { jest } from '@jest/globals';

const mockFetch = jest.fn();

jest.unstable_mockModule('node-fetch', () => ({
  default: mockFetch
}));

function mockHtmlResponse(jobs) {
  const jobHtml = jobs.map(j => `
    <a href="${j.href}" class="karrierjob">
      <h3 class="karrierjob__h3">${j.title}</h3>
      <div class="karrierjob__cimek karrierjob__cimek-grid">
        <p class="karrierjob__p karrierjob__p-no-break karrierjob__p-link">${j.location}</p>
      </div>
    </a>
  `).join('\n');

  return {
    ok: true,
    text: async () => `<html><body>${jobHtml}</body></html>`
  };
}

const MOCK_JOBS = [
  { href: '/cariera/locuri-de-munca/123/456', title: 'Mecanic Auto', location: 'Bucuresti, 050156 Sos. Viilor nr. 14 Sector 5' },
  { href: '/cariera/locuri-de-munca/124/457', title: 'Electrician Auto', location: 'Cluj-Napoca, Str. Dorobantilor 98-100' },
  { href: '/cariera/locuri-de-munca/125/458', title: 'Tinichigiu Auto', location: 'Timisoara, Calea Urseni 30' }
];

describe('index.js — Unixauto scraper', () => {
  let index;

  beforeAll(async () => {
    index = await import('../../index.js');
  });

  afterEach(() => {
    mockFetch.mockReset();
  });

  describe('extractJobsFromAboutPage', () => {
    it('should extract all jobs from HTML', () => {
      const html = `<html><body>
        <a href="/cariera/locuri-de-munca/123/456" class="karrierjob">
          <h3 class="karrierjob__h3">Mecanic Auto</h3>
          <div class="karrierjob__cimek karrierjob__cimek-grid">
            <p class="karrierjob__p karrierjob__p-no-break karrierjob__p-link">Bucuresti, 050156 Sos. Viilor nr. 14 Sector 5</p>
          </div>
        </a>
        <a href="/cariera/locuri-de-munca/124/457" class="karrierjob">
          <h3 class="karrierjob__h3">Electrician Auto</h3>
          <div class="karrierjob__cimek karrierjob__cimek-grid">
            <p class="karrierjob__p karrierjob__p-no-break karrierjob__p-link">Cluj-Napoca, Str. Dorobantilor 98-100</p>
          </div>
        </a>
      </body></html>`;

      const result = index.extractJobsFromAboutPage(html);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Mecanic Auto');
      expect(result[0].location).toEqual(['Bucuresti']);
      expect(result[0].url).toBe('https://www.unixauto.ro/cariera/locuri-de-munca/123/456');
      expect(result[1].title).toBe('Electrician Auto');
      expect(result[1].location).toEqual(['Cluj-Napoca']);
    });

    it('should extract city from first location paragraph', () => {
      const html = `<html><body>
        <a href="/cariera/locuri-de-munca/99/88" class="karrierjob">
          <h3 class="karrierjob__h3">Vanzator Piese</h3>
          <div class="karrierjob__cimek karrierjob__cimek-grid">
            <p class="karrierjob__p karrierjob__p-no-break karrierjob__p-link">Timisoara, Calea Urseni 30</p>
            <p class="karrierjob__p karrierjob__p-no-break karrierjob__p-link">Arad, Strada Libertatii 10</p>
          </div>
        </a>
      </body></html>`;

      const result = index.extractJobsFromAboutPage(html);

      expect(result).toHaveLength(1);
      expect(result[0].location).toEqual(['Timisoara']);
    });

    it('should use România fallback when no location text', () => {
      const html = `<html><body>
        <a href="/cariera/locuri-de-munca/1/1" class="karrierjob">
          <h3 class="karrierjob__h3">Job Fara Adresa</h3>
          <div class="karrierjob__cimek karrierjob__cimek-grid">
            <p class="karrierjob__p karrierjob__p-no-break karrierjob__p-link"></p>
          </div>
        </a>
      </body></html>`;

      const result = index.extractJobsFromAboutPage(html);

      expect(result).toHaveLength(1);
      expect(result[0].location).toEqual(['România']);
    });

    it('should set workplaceType to on-site for all jobs', () => {
      const html = `<html><body>
        <a href="/cariera/locuri-de-munca/1/1" class="karrierjob">
          <h3 class="karrierjob__h3">Test Job</h3>
          <div class="karrierjob__cimek karrierjob__cimek-grid">
            <p class="karrierjob__p karrierjob__p-no-break karrierjob__p-link">Iasi, Strada Mare 1</p>
          </div>
        </a>
      </body></html>`;

      const result = index.extractJobsFromAboutPage(html);

      expect(result[0].workplaceType).toBe('on-site');
    });

    it('should set postingDate to today', () => {
      const html = `<html><body>
        <a href="/cariera/locuri-de-munca/1/1" class="karrierjob">
          <h3 class="karrierjob__h3">Test</h3>
          <div class="karrierjob__cimek karrierjob__cimek-grid">
            <p class="karrierjob__p karrierjob__p-no-break karrierjob__p-link">Brasov, Strada 1</p>
          </div>
        </a>
      </body></html>`;

      const result = index.extractJobsFromAboutPage(html);
      const today = new Date().toISOString().split('T')[0];

      expect(result[0].postingDate).toBe(today);
    });

    it('should set status to scraped', () => {
      const html = `<html><body>
        <a href="/cariera/locuri-de-munca/1/1" class="karrierjob">
          <h3 class="karrierjob__h3">Test</h3>
          <div class="karrierjob__cimek karrierjob__cimek-grid">
            <p class="karrierjob__p karrierjob__p-no-break karrierjob__p-link">Sibiu, Strada 1</p>
          </div>
        </a>
      </body></html>`;

      const result = index.extractJobsFromAboutPage(html);

      expect(result[0].status).toBe('scraped');
    });

    it('should return empty array when no job links exist', () => {
      const html = '<html><body><p>No jobs here</p></body></html>';

      const result = index.extractJobsFromAboutPage(html);

      expect(result).toEqual([]);
    });
  });

  describe('scrapeJobs', () => {
    it('should fetch careers page and return parsed jobs', async () => {
      mockFetch.mockResolvedValueOnce(mockHtmlResponse(MOCK_JOBS));

      const result = await index.scrapeJobs();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.unixauto.ro/cariera/cautator',
        expect.objectContaining({ headers: { "User-Agent": "job_seeker_ro_spider" } })
      );
      expect(result).toHaveLength(3);
      expect(result[0].title).toBe('Mecanic Auto');
      expect(result[1].title).toBe('Electrician Auto');
      expect(result[2].title).toBe('Tinichigiu Auto');
    });

    it('should throw when fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

      await expect(index.scrapeJobs()).rejects.toThrow();
    });
  });

  describe('transformJobs', () => {
    it('should wrap jobs in { jobs } object', () => {
      const jobs = [
        { url: 'https://www.unixauto.ro/cariera/locuri-de-munca/1/1', title: 'Test' }
      ];

      const result = index.transformJobs(jobs);

      expect(result).toEqual({ jobs });
      expect(result.jobs).toBe(jobs);
    });

    it('should handle empty array', () => {
      const result = index.transformJobs([]);
      expect(result).toEqual({ jobs: [] });
    });
  });

  describe('uploadJobsToSolr', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
      process.env = { ...OLD_ENV };
      delete process.env.SOLR_AUTH;
    });

    afterAll(() => {
      process.env = OLD_ENV;
    });

    it('should skip upload when SOLR_AUTH is not set', async () => {
      const payload = { jobs: [{ url: 'https://test.com/1', title: 'Test' }] };

      await index.uploadJobsToSolr(payload);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should upload to SOLR when SOLR_AUTH is set', async () => {
      process.env.SOLR_AUTH = 'user:pass';
      mockFetch.mockResolvedValueOnce({ ok: true });

      const payload = { jobs: [{ url: 'https://test.com/1', title: 'Test' }] };

      await index.uploadJobsToSolr(payload);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain('solr.peviitor.ro');
      const callOpts = mockFetch.mock.calls[0][1];
      expect(callOpts.method).toBe('POST');
      expect(callOpts.headers['Authorization']).toContain('Basic');
      expect(callOpts.headers['Content-Type']).toBe('application/json');
    });

    it('should throw on SOLR upload failure', async () => {
      process.env.SOLR_AUTH = 'user:pass';
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Error' });

      const payload = { jobs: [{ url: 'https://test.com/1', title: 'Test' }] };

      await expect(index.uploadJobsToSolr(payload)).rejects.toThrow('SOLR upload error: 500');
    });
  });
});
