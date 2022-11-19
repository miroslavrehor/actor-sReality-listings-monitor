// import { Actor } from 'apify';
// import { log } from '@crawlee/puppeteer';
// import { sleep } from '@crawlee/utils';

export async function extractProperties({ page, dataset }) {
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

                const namePart1 = name.split(', ')[0];
                const property = namePart1;
                const areaLiving = namePart1.match(/(\s([0-9]+\s)+)/g)[0].replace(/\s/g, '');

                const namePart2 = name.split(', ')[1];
                let areaLand = '';
                if (namePart2) {
                    // muze byt prazdne u bytu
                    areaLand = namePart2.replace(/\s/g, '').match(/([0-9]+)/g)[1];
                }

                // locality:
                // Smrková, Doksy
                // Anny Letenské, Praha 2 - Vinohrady
                // Chotěšice - Břístev, okres Nymburk
                // Úvaly, okres Praha-východ
                // Praha 4
                const locality0 = locality.split(', ')[0];
                const locality1 = locality.split(', ')[1];
                let street = '';
                let city = '';
                let cityDistrict = '';
                let region = '';
                if (locality1) {
                    if (locality1.startsWith('okres')) {
                        street = '';
                        city = locality0.split(' - ')[0];
                        cityDistrict = locality0.split(' - ')[1];
                        region = locality1.replace('okres ', '');
                    } else {
                        street = locality0;
                        city = locality1.split(' - ')[0];
                        cityDistrict = locality1.split(' - ')[1];
                        region = '';
                    }
                } else {
                    street = '';
                    city = locality0.split(' - ')[0];
                    cityDistrict = locality0.split(' - ')[1];
                    region = '';
                }

                // norm-price:
                // 33 330 000 Kč
                // 30 000 Kč za měsíc
                let price = '';
                let pricePerSqm = '';
                if (normPrice) {
                    price = normPrice.replace('Kč', '').replace(' za měsíc', '').replace(/\s/g,'');
                    pricePerSqm = price / areaLiving;
                }

                const url = listing.querySelector('a').href;

                output.push({
                    date: new Date().toISOString().slice(0, 10),
                    id: url.match(/.*\/([0-9]+)/)[1],
                    url,
                    property,
                    areaLiving,
                    areaLand,
                    street,
                    city,
                    cityDistrict,
                    region,
                    price,
                    // description: TBD, na to kasleme, nejake labely zbytecne jenom
                    pricePerSqm: Math.round(pricePerSqm),
                });
            }
        });
        return output;
    });
    await dataset.pushData(listings);
}

export async function removeCookiesConsentBanner(page) {
    return page.evaluate(() => document.querySelector('.szn-cmp-dialog-container')?.remove());
}
