import { Actor } from 'apify';
import { PuppeteerCrawler, KeyValueStore, log } from '@crawlee/puppeteer';
import {
    extractProperties,
} from './tools.js'; // eslint-disable-line import/extensions

const args = process.argv.slice(2);
const APPARTMENTS_SALE = 'appartments-sale';
const APPARTMENTS_RENT = 'appartments-rent';
const HOUSES_SALE = 'houses-sale';

let urlTemplate = undefined;
let fileName = undefined;
switch (args[0]) {
    case APPARTMENTS_SALE:
        urlTemplate = 'https://www.sreality.cz/hledani/prodej/byty?no_shares=1&bez-aukce=1&strana='
        fileName = APPARTMENTS_SALE;
        break;
    case APPARTMENTS_RENT:
        urlTemplate = 'https://www.sreality.cz/hledani/pronajem/byty?no_shares=1&bez-aukce=1&strana='
        fileName = APPARTMENTS_RENT;
        break;
    case HOUSES_SALE:
        urlTemplate = "https://www.sreality.cz/hledani/prodej/domy?no_shares=1&bez-aukce=1&strana=";
        fileName = HOUSES_SALE;
}

await Actor.init();
const dataset = await Actor.openDataset();

const crawler = new PuppeteerCrawler({
    maxConcurrency: 2,
    maxRequestsPerMinute: 20,
    launchContext: {
        useChrome: true,
        launchOptions: { headless: true },
    },
    async requestHandler({ page, request, log }) {
        const { url, label } = request;
        log.info(`Processing ${label} | ${url}`);

       if (label === 'firstSearchPage') {
            const totalPages = await page.evaluate(() => {
                const pagingInfo = document.querySelector('.paging > .info').textContent;
                const totalListings = pagingInfo.match(/(\s([0-9]+\s)+)/g)[0].replace(/\s/g,'')
                const LISTINGS_PER_PAGE = 20;
                return Math.ceil(totalListings / LISTINGS_PER_PAGE);
            });
            log.info(`Processing ${totalPages} total pages of listings`);

            const newRequests = []
            for (let i = 2; i <= totalPages; i++) {
                newRequests.push({
                    url: `${urlTemplate}${i}`,
                    label: 'searchPage'
                });
            }
            log.info(`newRequests.length = ${newRequests.length}`);
            await crawler.addRequests(newRequests);
        } else if (label === 'searchPage') {
            await extractProperties({ page, dataset });
        }
    },
    preNavigationHooks: [
        async (ctx, gotoOptions) => {
            gotoOptions.waitUntil = ['load', 'networkidle0'];
        },
    ]
});

const initialRequests = [{
    url: `${urlTemplate}1`,
    label: 'firstSearchPage'
}]
await crawler.run(initialRequests);

const today = new Date().toISOString().slice(0, 10);
const name = `${today}_${fileName}`;
await dataset.exportToJSON(name, {toKVS: name});
await dataset.exportToCSV(name, {toKVS: name});

await Actor.exit();
