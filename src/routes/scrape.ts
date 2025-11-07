import { Router, Request, Response } from 'express';
import { isValidHttpUrl } from '../utils/validateUrl';

const router = Router();
const GLOBAL_TIMEOUT_MS = 20000; // 20s
const NAVIGATION_TIMEOUT_MS = 15000; // 15s
const MAX_ATTEMPTS = 2;

router.get('/', async (req: Request, res: Response) => {
  const url = req.query.url as string | undefined;
  const userAgent = req.query.ua as string | undefined;

  // Validate URL
  if (!isValidHttpUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const playwright = await import('playwright');

  const attemptScrape = async (attemptNumber: number) => {
    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: userAgent || undefined,
    });
    const page = await context.newPage();

    try {
      await page.goto(url!, { waitUntil: 'networkidle', timeout: NAVIGATION_TIMEOUT_MS });

      const title = (await page.title()) || null;

      const metaDescription = await page
        .$eval('head > meta[name="description"], head > meta[property="og:description"]', el =>
          el.getAttribute('content'),
        )
        .catch(() => null);

      const h1 = await page.$eval('h1', el => el.textContent?.trim()).catch(() => null);

      await browser.close();

      return { title, metaDescription, h1, status: 200 };
    } catch (err) {
      await browser.close();
      throw err;
    }
  };

  const overallPromise = new Promise(async (resolve, reject) => {
    let lastError: any = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const result = await attemptScrape(attempt);
        return resolve(result);
      } catch (err) {
        lastError = err;
        console.warn(`Attempt ${attempt} failed:`, (err as Error).message);
      }
    }

    reject(lastError || new Error('Unknown error'));
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), GLOBAL_TIMEOUT_MS),
  );

  try {
    const result = await Promise.race([overallPromise, timeoutPromise]);
    res.status(200).json(result);
  } catch (err: any) {
    const message = err.message || 'Scraping failed';
    if (message.includes('Timeout')) {
      res.status(504).json({ error: 'Timeout' });
    } else {
      res.status(500).json({ error: 'Scraping failed', details: message });
    }
  }
});

export default router;
