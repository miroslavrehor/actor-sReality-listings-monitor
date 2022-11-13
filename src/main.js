import { Actor } from 'apify';
import { PuppeteerCrawler } from '@crawlee/puppeteer';
import { utils } from '@crawlee';
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
const storeName = `sReality-monitor-store-${!process.env.APIFY_ACTOR_TASK_ID
    ? process.env.APIFY_ACT_ID
    : process.env.APIFY_ACTOR_TASK_ID}`;
const store = await Actor.openKeyValueStore(storeName);
const previousData = await store.getValue('currentData');

const proxyConfiguration = await Actor.createProxyConfiguration(proxy);

const crawler = new PuppeteerCrawler({
    proxyConfiguration,
    launchContext: {
        useChrome: true,
        launchOptions: { headless: false },
    },
    async requestHandler({ page, request, log }) {
        const { url, label } = request;
        log.info(`Processing ${label} | ${url}`);

        if (label === 'startPage') {
            await selectOfferType({ page, offerType });
            await selectSubtype({ page, subtype, type });
            await setLocation({ page, location });
            await setOtherParams({ page, price, livingArea });
            const propertiesFound = await loadSearchResults({ page, store, previousData, sendNotificationTo });
            if (propertiesFound) await extractProperties({ page, dataset });
        } else if (label === 'searchPage') {
            await extractProperties({ page, dataset });
        }

        await enqueueNextPage({ page, maxPages, crawler });
    },
    preNavigationHooks: [
        async (ctx, gotoOptions) => {
            gotoOptions.waitUntil = ['load', 'networkidle0'];

            const { page } = ctx;
            utils.puppeteer.saveSnapshot(page, { key: page.url(), saveHtml: true });
        },
    ]
});

const initialRequests = getSearchUrl(type);
await crawler.run(initialRequests);

await compareDataAndSendNotification({ store, dataset, previousData, sendNotificationTo });

await Actor.exit();
