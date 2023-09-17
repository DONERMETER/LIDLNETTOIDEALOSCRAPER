const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const { exec } = require('child_process');

// Dynamic port binding for Azure
const port = process.env.PORT || 8080;

let chromiumVersion = 'Checking...';
let puppeteerVersion = require('puppeteer-core/package.json').version;
let nodeVersion = process.version;

// Check Chromium version when the app starts
exec('chromium-browser --version', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error executing Chromium command: ${error}`);
    chromiumVersion = 'Error';
  } else {
    console.log(`Chromium version: ${stdout}`);
    chromiumVersion = stdout;
  }
});

app.get('/', (req, res) => {
  res.send(`Scraping service is running.<br>
            STATUS: <br>
            PUPPETEER: ${puppeteerVersion} OK<br>
            CHROMIUM: ${chromiumVersion}<br>
            NODE: ${nodeVersion} OK`);
});

app.get('/scrape', async (req, res) => {
  try {
    const url = req.query.url;
    const store = req.query.store;
    const article = req.query.article;
    let result;

    if (store === 'Lidl') {
      result = await scrapeLidl(url, article);
    } else if (store === 'Netto') {
      result = await scrapeNetto(url);
    } else if (store === 'Idealo') {
      const seller = decodeURIComponent(req.query.seller);
      result = await scrapeIdealo(url, seller);
    } else {
      return res.status(400).send({ error: 'Invalid store type' });
    }

    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

async function scrapeLidl(url, targetArticleNumber) {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium-browser' });
  const page = await browser.newPage();
  await page.goto(url);

  await page.waitForSelector('.buybox__erp-number', { timeout: 10000 });
  
  const variationOptions = await page.$$eval('#product-P_ART option', options => options.map(o => o.value));
  
  for (const option of variationOptions) {
    if (option) {
      await page.select('#product-P_ART', option);
      await page.waitForTimeout(2000);
      await page.waitForSelector('.m-price__price', { timeout: 2000 });
      
      const currentArticleNumber = await page.$eval('.buybox__erp-number', el => el.textContent.trim());
      
      if (currentArticleNumber === targetArticleNumber) {
        const price = await page.$eval('.m-price__price', el => el.textContent.trim());
        await browser.close();
        return [{ variation: option, price: parseFloat(price) }];
      }
    }
  }
  
  await browser.close();
  return { error: 'No data found for the given parameters.' };
}

async function scrapeNetto(url) {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium-browser' });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });

  const priceBeforeComma = await page.$eval('.prices__ins--digits-before-comma', el => el.textContent.trim());
  const priceAfterComma = await page.$eval('.product__current-price--digits-after-comma', el => el.textContent.trim());
  const price = parseFloat(priceBeforeComma + '.' + priceAfterComma);

  await browser.close();
  return [{ price: price }];
}

async function scrapeIdealo(url, sellerName) {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium-browser', headless: false });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  const offers = await page.$$eval('.productOffers-listItemOfferLink', (offers, sellerName) => {
    const results = [];
    for (const offer of offers) {
      const shopName = offer.getAttribute('data-shop-name');
      let price = null;
      try {
        const payload = JSON.parse(offer.getAttribute('data-gtm-payload').replace(/&quot;/g, '"'));
        price = parseFloat(payload.product_price);
      } catch (error) {
        console.error("Error parsing price: ", error);
        continue;
      }

      if (shopName && shopName.includes(sellerName)) {
        results.push({ seller: shopName, price: price });
      }
    }
    return results;
  }, sellerName);

  await browser.close();
  return offers;
}

app.get('/scrape', async (req, res) => {
  const url = req.query.url;
  const store = req.query.store;
  const article = req.query.article;

  let result;
  if (store === 'Lidl') {
    result = await scrapeLidl(url, article);
  } else if (store === 'Netto') {
    result = await scrapeNetto(url);
  } else if (store === 'Idealo') {
    const seller = decodeURIComponent(req.query.seller);
    result = await scrapeIdealo(url, seller);
  } else {
    return res.status(400).send({ error: 'Invalid store type' });
  }

  res.send(result);
});

app.get('/', (req, res) => res.send('Scraping service is running.'));

app.listen(port, () => {
  console.log(`Scraping service listening at http://localhost:${port}`);
});
