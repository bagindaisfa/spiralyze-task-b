import { Router, Request, Response } from 'express';
import { isValidHttpUrl } from '../utils/validateUrl';

/**
 * @fileoverview
 * Micro Scraper Endpoint
 * ----------------------
 * This endpoint extracts basic SEO-related information (title, meta description, and first h1)
 * from any public webpage using Playwright (headless Chromium).
 *
 * Endpoint: GET /api/scrape?url=...
 * Optional: &ua=customUserAgent (bonus)
 *
 * Example Response:
 * {
 *   "title": "Example Domain",
 *   "metaDescription": "This domain is for use in illustrative examples in documents.",
 *   "h1": "Example Domain",
 *   "status": 200
 * }
 *
 * Behavioral Rules:
 * - Timeout: 20 seconds total for the whole request.
 * - Retries: 1 retry on navigation errors (bonus feature).
 * - Wait condition: Waits for 'networkidle' before extracting.
 * - Headless mode only (no GUI setup required).
 *
 * Error Handling:
 * - Invalid or missing URL → 400
 * - Timeout (20s) → 504
 * - Other navigation or browser errors → 500
 */

const router = Router();

// Constants
const GLOBAL_TIMEOUT_MS = 20_000; // total allowed time per request (20 seconds)
const NAVIGATION_TIMEOUT_MS = 15_000; // per navigation attempt
const MAX_ATTEMPTS = 2; // number of scrape retries (1 retry allowed)

/**
 * @route GET /api/scrape
 * @query url - Target URL to scrape (required)
 * @query ua - Custom User-Agent string (optional)
 */
router.get('/', async (req: Request, res: Response) => {
  const url = req.query.url as string | undefined;
  const userAgent = req.query.ua as string | undefined;

  // ✅ Validate URL format before proceeding
  if (!isValidHttpUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Lazy import Playwright only when needed (reduces cold start)
  const playwright = await import('playwright');

  /**
   * Attempts to scrape the given URL once.
   * If navigation or page load fails, the caller can retry.
   */
  const attemptScrape = async (attemptNumber: number) => {
    console.log(`🕷️ Starting scrape attempt #${attemptNumber} for ${url}`);

    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: userAgent || undefined,
    });
    const page = await context.newPage();

    try {
      // Navigate to the URL and wait until the network is idle
      await page.goto(url!, { waitUntil: 'networkidle', timeout: NAVIGATION_TIMEOUT_MS });

      // Extract title, meta description, and first h1 tag
      const title = (await page.title()) || null;

      const metaDescription = await page
        .$eval('head > meta[name="description"], head > meta[property="og:description"]', el =>
          el.getAttribute('content'),
        )
        .catch(() => null);

      const h1 = await page.$eval('h1', el => el.textContent?.trim()).catch(() => null);

      await browser.close();

      console.log(`✅ Scrape successful (attempt #${attemptNumber})`);

      return { title, metaDescription, h1, status: 200 };
    } catch (err) {
      console.warn(`❌ Scrape attempt #${attemptNumber} failed:`, (err as Error).message);
      await browser.close();
      throw err;
    }
  };

  /**
   * Wraps the scraping logic inside a global timeout (20s)
   * and includes a simple retry mechanism for reliability.
   */
  const overallPromise = new Promise(async (resolve, reject) => {
    let lastError: any = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const result = await attemptScrape(attempt);
        return resolve(result);
      } catch (err) {
        lastError = err;
      }
    }

    reject(lastError || new Error('Unknown error'));
  });

  // Promise to enforce a hard timeout for the entire operation
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), GLOBAL_TIMEOUT_MS),
  );

  try {
    // Race: whichever resolves first (scraper or timeout)
    const result = await Promise.race([overallPromise, timeoutPromise]);
    res.status(200).json(result);
  } catch (err: any) {
    const message = err.message || 'Scraping failed';

    if (message.includes('Timeout')) {
      console.error('⏰ Scraping timed out.');
      return res.status(504).json({ error: 'Timeout' });
    }

    console.error('🚨 Scraper error:', message);
    return res.status(500).json({ error: 'Scraping failed', details: message });
  }
});

export default router;
