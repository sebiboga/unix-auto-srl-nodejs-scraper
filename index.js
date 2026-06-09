import * as cheerio from 'cheerio';
import fetch from "node-fetch";
import fs from "fs";
import { fileURLToPath } from "url";

const COMPANY_CIF = "10542416";
const COMPANY_NAME = "UNIX AUTO";
const BASE_URL = "https://www.unixauto.ro";

function extractCityFromLocation(text) {
  if (!text) return '';
  return text.split(',')[0].trim();
}

function extractJobsFromAboutPage(html) {
  const $ = cheerio.load(html);
  const jobs = [];

  $('a.karrierjob').each((i, el) => {
    const title = $(el).find('h3.karrierjob__h3').text().trim();
    const href = $(el).attr('href') || '';
    const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
    const firstLocationEl = $(el).find('p.karrierjob__p').first();
    const firstLocation = firstLocationEl.text().trim();
    const city = extractCityFromLocation(firstLocation);
    const date = new Date().toISOString();

    jobs.push({
      url,
      title,
      company: COMPANY_NAME,
      cif: COMPANY_CIF,
      location: city ? [city] : ['România'],
      workplaceType: 'on-site',
      postingDate: date.split('T')[0],
      date,
      status: 'scraped'
    });
  });

  return jobs;
}

async function scrapeJobs() {
  const res = await fetch(`${BASE_URL}/cariera/cautator`, {
    headers: { "User-Agent": "job_seeker_ro_spider" }
  });
  const html = await res.text();
  return extractJobsFromAboutPage(html);
}

function transformJobs(jobs) {
  return { jobs };
}

async function uploadJobsToSolr(transformedPayload) {
  const AUTH = process.env.SOLR_AUTH;
  if (!AUTH) {
    console.log("SOLR_AUTH not set — skipping upload");
    return;
  }

  const SOLR_URL = "https://solr.peviitor.ro/solr/job/update";
  const params = new URLSearchParams({ commit: "true" });

  const res = await fetch(`${SOLR_URL}?${params}`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(AUTH).toString("base64"),
      "Content-Type": "application/json",
      "User-Agent": "job_seeker_ro_spider"
    },
    body: JSON.stringify(transformedPayload.jobs)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SOLR upload error: ${res.status} - ${text}`);
  }

  console.log(`Uploaded ${transformedPayload.jobs.length} jobs to SOLR`);
}

async function main() {
  fs.mkdirSync("tmp", { recursive: true });

  const jobs = await scrapeJobs();
  console.log(`Scraped ${jobs.length} jobs`);

  const transformed = transformJobs(jobs);

  fs.writeFileSync("tmp/jobs.json", JSON.stringify(transformed, null, 2), "utf-8");
  console.log("Saved tmp/jobs.json");

  await uploadJobsToSolr(transformed);

  console.log("Done");
}

export { scrapeJobs, extractJobsFromAboutPage, transformJobs, uploadJobsToSolr };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
