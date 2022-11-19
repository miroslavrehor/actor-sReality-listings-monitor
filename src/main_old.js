import { Actor } from 'apify';
import { PuppeteerCrawler, KeyValueStore, log } from '@crawlee/puppeteer';
import {
    getAndValidateInput,
    getSearchUrl,
    selectOfferType,
    selectSubtype,
    setLocation,
    setOtherParams,
    loadSearchResults,
    extractProperties,
    enqueueNextPage,
    compareDataAndSendNotification,
} from './tools.js'; // eslint-disable-line import/extensions

await Actor.init();

const {
    proxy,
    sendNotificationTo,
    offerType,
    type,
    subtype,
    location,
    price,
    livingArea,
    maxPages,
} = await getAndValidateInput();

const dataset = await Actor.openDataset();
// use named key-value store based on task ID or actor ID
// to be able to have more listings checkers under one Apify account
// const storeName = `sReality-monitor-store-${!process.env.APIFY_ACTOR_TASK_ID
//     ? process.env.APIFY_ACT_ID
//     : process.env.APIFY_ACTOR_TASK_ID}`;
// const store = await Actor.openKeyValueStore(storeName);
// const previousData = await store.getValue('currentData');

// const proxyConfiguration = await Actor.createProxyConfiguration(proxy);
// https://www.sreality.cz/hledani/prodej/byty?no_shares=1&bez-aukce=1&strana=1
// https://www.sreality.cz/hledani/pronajem/byty?no_shares=1&bez-aukce=1&strana=1
// https://www.sreality.cz/hledani/prodej/domy?no_shares=1&bez-aukce=1&strana=1
const urlTemplate = "https://www.sreality.cz/hledani/prodej/domy?no_shares=1&bez-aukce=1&strana=";

const crawler = new PuppeteerCrawler({
    // proxyConfiguration,
    launchContext: {
        useChrome: true,
        launchOptions: { headless: true },
    },
    async requestHandler({ page, request, log }) {
        const { url, label } = request;
        log.info(`Processing ${label} | ${url}`);
        // const screenshot = await page.screenshot();
        // await KeyValueStore.setValue(url.replace(/[:/?&=]/g, '_'), screenshot, { contentType: 'image/png' });

        if (label === 'startPage') {
            // await selectOfferType({ page, offerType });
            // await selectSubtype({ page, subtype, type });
            // await setLocation({ page, location });
            // await setOtherParams({ page, price, livingArea });
            // const propertiesFound = await loadSearchResults({ page, store, previousData, sendNotificationTo });
            if (propertiesFound) await extractProperties({ page, dataset });
        } else if (label === 'firstSearchPage') {
            const totalPages = await page.evaluate(() => {
                const pagingInfo = document.querySelector('.paging > .info').textContent;
                const totalListings = pagingInfo.match(/(\s([0-9]+\s)+)/g)[0].replace(/\s/g,'')
                const LISTINGS_PER_PAGE = 20;
                return Math.ceil(totalListings / LISTINGS_PER_PAGE);
            });
            log.info(totalPages);
            const newRequests = []
            for (let i = 2; i <= 2; i++) {
                newRequests.push({
                    url: `${urlTemplate}${i}`,
                    label: 'searchPage'
                });
            }
            log.info(newRequests.length);
            await crawler.addRequests(newRequests);
        } else if (label === 'searchPage') {
            await extractProperties({ page, dataset });
        }

        // await enqueueNextPage({ page, maxPages, crawler });
    },
    preNavigationHooks: [
        async (ctx, gotoOptions) => {
            gotoOptions.waitUntil = ['load', 'networkidle0'];
        },
    ]
});

// const initialRequests = getSearchUrl(type);
const initialRequests = [{
    url: `${urlTemplate}1`,
    label: 'firstSearchPage'
}]
await crawler.run(initialRequests);

// await compareDataAndSendNotification({ store, dataset, previousData, sendNotificationTo });
const today = new Date().toISOString().slice(0, 10);
await dataset.exportToJSON(`${today}_domy-prodej`);
await dataset.exportToCSV(`${today}_domy-prodej`);

await Actor.exit();
