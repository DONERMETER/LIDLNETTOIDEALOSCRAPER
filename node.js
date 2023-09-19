const express = require('express');
const puppeteer = require('puppeteer-core');
const app = express();
const { exec } = require('child_process');

// Azure Dynamic Port Configuration
const port = process.env.PORT || 8080;

let chromiumVersion = 'Checking...';
let puppeteerVersion = require('puppeteer-core/package.json').version;
let nodeVersion = process.version;

// Validate Chromium Version at Startup
exec('chromium-browser --version', (error, stdout, stderr) => {
  if (error) {
    console.error(`Chromium Command Error: ${error}`);
    chromiumVersion = 'Error';
  } else {
    console.log(`Chromium Version: ${stdout}`);
    chromiumVersion = stdout;
  }
});

app.get('/', (req, res) => {
  res.send(`PEGASOMARINE Scraping Service ist Aktiv.<br>
            Status: <br>
            Puppeteer Version: ${puppeteerVersion} OK<br>
            Chromium Version: ${chromiumVersion}<br>
            Node Version: ${nodeVersion} OK`);
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
      return res.status(400).send({ error: 'Invalid Store' });
    }

    res.send(result);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});
async function fetchLidlData(url, targetArticleNumber) {
  const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
  const page = await browser.newPage();
  await page.goto(url);

  await page.waitForSelector('.buybox__erp-number', { timeout: 10000 });

  const optionsList = await page.$$eval('#product-P_ART option', options => options.map(option => option.value));

  for (const opt of optionsList) {
    if (opt) {
      await page.select('#product-P_ART', opt);
      await page.waitForTimeout(2000);
      await page.waitForSelector('.m-price__price', { timeout: 2000 });

      const currentArticle = await page.$eval('.buybox__erp-number', element => element.textContent.trim());

      if (currentArticle === targetArticleNumber) {
        const priceData = await page.$eval('.m-price__price', element => element.textContent.trim());
        await browser.close();
        return [{ variation: opt, price: parseFloat(priceData) }];
      }
    }
  }
  await browser.close();
  return { error: 'No matching data found.' };
}

async function fetchNettoData(url) {
  const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });

  const priceInt = await page.$eval('.prices__ins--digits-before-comma', element => element.textContent.trim());
  const priceDec = await page.$eval('.product__current-price--digits-after-comma', element => element.textContent.trim());
  const finalPrice = parseFloat(priceInt + '.' + priceDec);

  await browser.close();
  return [{ price: finalPrice }];
}

async function fetchIdealoData(url, shopName) {
  const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  const offersList = await page.$$eval('.productOffers-listItemOfferLink', (offers, shopName) => {
    const resultsArray = [];
    for (const offer of offers) {
      const storeName = offer.getAttribute('data-shop-name');
      let offerPrice = null;

      try {
        const payload = JSON.parse(offer.getAttribute('data-gtm-payload').replace(/&quot;/g, '"'));
        offerPrice = parseFloat(payload.product_price);
      } catch (error) {
        console.error("Error parsing the price: ", error);
        continue;
      }

      if (storeName && storeName.includes(shopName)) {
        resultsArray.push({ seller: storeName, price: offerPrice });
      }
    }
    return resultsArray;
  }, shopName);

  await browser.close();
  return offersList;
}
