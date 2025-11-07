# 🧠 Micro Scraper API

A lightweight scraping API built with **Express.js** and **Playwright**.

---

## 🚀 Features
- Extracts page **title**, **meta description**, and **first h1**.
- 20-second global timeout.
- Handles invalid URLs, navigation failures, and timeouts.
- Headless mode (no GUI required).
- Bonus:
  - User-Agent override (`?ua=...`)
  - 1 automatic retry on navigation errors

---

## 🧩 Tech Stack
- Node.js + Express
- TypeScript
- Playwright (Chromium headless)

---

## ⚙️ Setup

```bash
npm install
npm run dev
