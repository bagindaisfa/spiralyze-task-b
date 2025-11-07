import express from 'express';
import scrapeRouter from './routes/scrape';

const app = express();
const PORT = process.env.PORT || 4000;

// Base route
app.get('/', (_, res) => {
  res.send('Micro Scraper API is running 🚀');
});

// Scraper route
app.use('/api/scrape', scrapeRouter);

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});
