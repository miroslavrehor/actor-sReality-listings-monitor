const Apify = require('apify');
const { SELECTORS, ESTATE_TYPES, OFFER_TYPES } = require('./consts');

const { utils: { log, sleep } } = Apify;

const getAndValidateInput = async () => {
    const input = await Apify.getInput();
    const {
        location,
        offerType,
        type,
        maxPages,
        proxyConfiguration,
        notificationsEmail,
        priceMin,
        priceMax,
        areaMin,
        areaMax,
    } = input;

    log.info(`Search Location: ${location}`);
    log.info(`Object Type: ${type}`);
    log.info(`Operation Type: ${offerType}`);

    // if (!offerType || !type || !location) {
    if (!offerType || !type) {
        throw new Error('Check input! Offer type (sale/rent/auction), type (house/apartment/etc) or location are missing');
    }

    const price = {};
    if (priceMin) price.from = priceMin.toString();
    if (priceMax) price.to = priceMax.toString();

    const livingArea = {};
    if (areaMin) livingArea.from = areaMin.toString();
    if (areaMax) livingArea.to = areaMax.toString();

    const subtype = [];
    const inputKeys = Object.keys(input);
    for (const key of inputKeys) {
        if (key.startsWith(input.type) && input[key] === true) {
            subtype.push(key.split(':')[1]);
        }
    }

    return {
        proxy: proxyConfiguration,
        sendNotificationTo: notificationsEmail,
        offerType,
        type,
        subtype,
        location,
        price,
        livingArea,
        maxPages,
    };
}

const getSearchUrl = (type) => {
    return [{
        url: ESTATE_TYPES[type].url,
        userData: { label: 'startPage' },
    }];
}

const selectOfferType = async ({ page, offerType }) => {
    await removeCookiesConsentBanner(page);
    await page.click(OFFER_TYPES[offerType].selectors.switcher)
        .catch(err => { throw new Error(`No selector matched: offerType -> ${offerType}`); });
    await sleep(1000);
}

const selectSubtype = async ({ page, subtype, type }) => {
    await removeCookiesConsentBanner(page);
    if (subtype.length > 0) {
        const subtypes = subtype.map(st => ESTATE_TYPES[type].subtypes[st]);
        const $$subtype = await matchNodesByContents(page, SELECTORS.subtype, subtypes)
            .catch(error => {
                log.error(error.message);
                throw Error(`No selector matched: subtype -> ${subtype.join('; ')}`);
            });
        await Promise.all($$subtype.map($node => $node.click()));
    }
}

const setLocation = async ({ page, location }) => {
    if (!location) {
        return;
    }
    await removeCookiesConsentBanner(page);
    await page.type(SELECTORS.location.input, location);
    await page.waitForFunction(selector => document.querySelector(selector), { polling: 'mutation' }, SELECTORS.location.autocomplete);
    await sleep(1000);
    await page.keyboard.press('Enter');
    await sleep(1000);
}

const setOtherParams = async ({ page, price, livingArea }) => {
    await removeCookiesConsentBanner(page);
    if (price && price.from) await page.type(SELECTORS.price.from, price.from, { delay: 100 });
    if (price && price.to) await page.type(SELECTORS.price.to, price.to, { delay: 100 });
    if (livingArea && livingArea.from) await page.type(SELECTORS.area.from, livingArea.from, { delay: 100 });
    if (livingArea && livingArea.to) await page.type(SELECTORS.area.to, livingArea.to, { delay: 100 });
    await page.click('form div.region.distance .line-title');
    await sleep(2000);
}

const loadSearchResults = async ({ page, store, previousData, sendNotificationTo }) => {
    await removeCookiesConsentBanner(page);

    const showResultsButton = await page.evaluate(() => {
        return document.querySelector('.return-cover')
            && !document.querySelector('.filter__buttons__not-found');
    });

    if (showResultsButton) {
        await Promise.all([
            page.waitForNavigation({ waitUntil: ['load', 'networkidle0'] }),
            page.click(SELECTORS.submit)
        ]);
        await page.waitForSelector('.dir-property-list');
    } else {
        log.info('No search results');
        await store.setValue('currentData', []);
        if (!previousData) {
            log.info('Initial run, no previously found listings. Sending email');
            if (sendNotificationTo) await Apify.call('apify/send-mail', {
                to: sendNotificationTo,
                subject: 'Apify sRelity Listings Monitor - No Listing(s) Found',
                text: 'No listing(s) matching your query found',
            });
        } else {
            if (previousData.length > 0) {
                log.info('Previously found listings were removed. Sending email')
                await store.setValue('previousData', previousData);
                if (sendNotificationTo) await Apify.call('apify/send-mail', {
                    to: sendNotificationTo,
                    subject: 'Apify sRelity Listings Monitor - Listing(s) Removed',
                    text: 'Previously found listing(s):' + '\n' + previousData.join('\n'),
                });
            }
        }
    }

    return showResultsButton;
}

const extractProperties = async ({ page, dataset }) => {
    await removeCookiesConsentBanner(page);
    const listings = await page.evaluate(() => {
        const output = [];
        [...document.querySelectorAll('.dir-property-list > .property')].map((listing) => {
            if (!listing.querySelector('span[class*=tip]')) {
                // name:
                // Prodej  rodinného domu 1 333 m², pozemek 2 184 m²
                // Prodej bytu 1+kk 1 137 m²
                // Pronájem bytu 2+1 1 163 m²
                const name = listing.querySelector('.name').textContent;
                const locality = listing.querySelector('.locality').textContent;
                const normPrice = listing.querySelector('.norm-price').textContent;

                const namePart1 = name.split(", ")[0];
                const property = namePart1;
                const areaLiving = namePart1.match(/(\s([0-9]+\s)+)/g)[0].replace(/\s/g,'');

                const namePart2 = name.split(", ")[1];
                let areaLand = "";
                if (namePart2) {
                    // muze byt prazdne u bytu
                    areaLand = namePart2.replace(/\s/g,'').match(/([0-9]+)/g)[1];
                }

                // locality:
                // Smrková, Doksy
                // Anny Letenské, Praha 2 - Vinohrady
                // Chotěšice - Břístev, okres Nymburk
                // Úvaly, okres Praha-východ
                // Praha 4
                const locality0 = locality.split(", ")[0];
                const locality1 = locality.split(", ")[1];
                let street = "";
                let city = "";
                let cityDistrict = "";
                let region = "";
                if (locality1) {
                    if (locality1.startsWith("okres")) {
                        street = "";
                        city = locality0.split(" - ")[0];
                        cityDistrict = locality0.split(" - ")[1];
                        region = locality1.replace("okres ", "");
                    } else {
                        street = locality0;
                        city = locality1.split(" - ")[0];
                        cityDistrict = locality1.split(" - ")[1];
                        region = "";
                    }
                } else {
                    street = "";
                    city = locality0.split(" - ")[0];
                    cityDistrict = locality0.split(" - ")[1];
                    region = "";
                }

                // norm-price:
                // 33 330 000 Kč
                // 30 000 Kč za měsíc
                let price = "";
                let pricePerSqm = "";
                if (normPrice) {
                    price = normPrice.replace("Kč", "").replace(" za měsíc", "").replace(/\s/g,'');
                    pricePerSqm = price / areaLiving;
                }

                const url = listing.querySelector('a').href;

                output.push({
                    date: new Date().toISOString().slice(0, 10),
                    id: url.match(/.*\/([0-9]+)/)[1],
                    url: url,
                    property: property,
                    areaLiving: areaLiving,
                    areaLand: areaLand,
                    street: street,
                    city: city,
                    cityDistrict: cityDistrict,
                    region: region,
                    price: price,
                    // description: TBD, na to kasleme, nejake labely zbytecne jenom
                    pricePerSqm: Math.round(pricePerSqm),
                });
            }
        });
        return output;
    });
    await dataset.pushData(listings);
}

const enqueueNextPage = async ({ page, maxPages, requestQueue }) => {
    log.info(requestQueue);
    log.info(page);
    await removeCookiesConsentBanner(page);
    const currentPage = await page.evaluate(() => {
        const currentPageSelector = document.querySelector('.paging-item > a.active');
        return currentPageSelector ? Number(currentPageSelector.innerText) : null;
    });
    const nextPageUrl = await page.evaluate(() => {
        const nextPageSelector = document.querySelector('.paging-item > a.paging-next');
        return nextPageSelector ? nextPageSelector.href : null;
    });
    if ((currentPage && maxPages && currentPage < maxPages) || (!maxPages && nextPageUrl)) {
        await requestQueue.addRequest({ url: nextPageUrl, userData: { label: 'searchPage' } });
    }
}

const compareDataAndSendNotification = async ({ store, dataset, previousData, sendNotificationTo }) => {
    const outputItems = await dataset.getData().then(response => response.items);
    const currentData = outputItems.map(entry => entry.url);
    await store.setValue('currentData', currentData);
    log.info(`${currentData.length} matching listing(s) found`)

    if (!previousData) {
        log.info('Initial run, no previously found listings');
        if (sendNotificationTo) {
            log.info('Sending Email');
            await Apify.call('apify/send-mail', {
                to: sendNotificationTo,
                subject: 'Apify sRelity Listings Monitor - Listing(s) Found',
                text: 'Found listing(s):' + '\n' + currentData.join('\n'),
            });
        }
    } else {
        await store.setValue('previousData', previousData);
        if (!(previousData.every(e => currentData.includes(e)) && currentData.every(e => previousData.includes(e)))) {
            log.info('There were some updates');
            if (sendNotificationTo) {
                log.info('Sending Email');
                await Apify.call('apify/send-mail', {
                    to: sendNotificationTo,
                    subject: 'Apify sRelity Listings Monitor - Listing(s) Updated',
                    text: 'Currently found listing(s):' + '\n' + currentData.join('\n') + '\n\n'
                        + 'Previously found listing(s):' + '\n' + previousData.join('\n'),
                });
            }
        } else {
            log.info('No new listing(s) found');
        }
    }
}

const matchNodesByContents = async (page, selector, contents) => {
    await removeCookiesConsentBanner(page);
    contents = Array.isArray(contents) ? contents : [contents];

    const $$nodes = await page.$$(selector);

    const nodes = await Promise.all($$nodes.map(async $node => ({
        node: $node,
        content: await $node.evaluate(node => node.innerText)
    })));

    return nodes
        .filter(node => {
            contents.some(content => {
                return node.content.trim().toLowerCase() === content.trim().toLowerCase();
            });
        })
        .map(node => node.node);
};

const removeCookiesConsentBanner = async (page) => {
    return page.evaluate(() => document.querySelector('.szn-cmp-dialog-container')?.remove());
}

module.exports = {
    getAndValidateInput,
    getSearchUrl,
    selectOfferType,
    selectSubtype,
    setLocation,
    setOtherParams,
    loadSearchResults,
    enqueueNextPage,
    extractProperties,
    compareDataAndSendNotification,
};
