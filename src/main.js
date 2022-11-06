const Apify = require('apify');
const {
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
} = require('./tools');

Apify.main(async () => {
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

    const sources = getSearchUrl(type);
    const requestList = await Apify.openRequestList('sources', sources);
    const requestQueue = (!maxPages || (maxPages && maxPages > 1)) ? await Apify.openRequestQueue() : undefined;
    const dataset = await Apify.openDataset();

    // use named key-value store based on task ID or actor ID
    // to be able to have more listings checkers under one Apify account
    const storeName = `sReality-monitor-store-${!process.env.APIFY_ACTOR_TASK_ID ? process.env.APIFY_ACT_ID : process.env.APIFY_ACTOR_TASK_ID}`;
    const store = await Apify.openKeyValueStore(storeName);
    const previousData = await store.getValue('currentData');

    const proxyConfiguration = await Apify.createProxyConfiguration(proxy);

    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        requestQueue,
        proxyConfiguration,
        handlePageFunction: async ({ page, request }) => {
            const { userData: { label } } = request;
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
            await enqueueNextPage({ page, maxPages, requestQueue });
        },
        preNavigationHooks: [
            async ({ page, request }) => {
                // na 30 000 ms to casto pada, tak zkusime 100k
                return page.goto(request.url, { waitUntil: ['load', 'networkidle0'], timeout: 100000 });
            },
        ],
        handlePageTimeoutSecs: 100
    });

    await crawler.run();

    await compareDataAndSendNotification({ store, dataset, previousData, sendNotificationTo });
});
