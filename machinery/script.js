const requestp = require('request-promise-native');
const algoliasearch = require('algoliasearch')
const sha1 = require('js-sha1');

const algoliaClient = algoliasearch('RYX8NB8VDZ', process.env.ALGOLIA_ADMIN_KEY);
const algoliaIndex = algoliaClient.initIndex('qa');


const getPage = (url) => requestp(url);

const latestUrl = "https://billwurtz.com/questions/questions.html";
const getLatestPage = () => getPage(latestUrl);

const monthlyUrl = (year, month) =>
    `https://billwurtz.com/questions/questions-${year}-${("" + month).padStart(2, "0")}.html`;
const getMonthlyPage = (year, month)  => getPage(monthlyUrl(year, month));

const parsePage = (html) => {

    // remove the bottom of page
    const bottom = html.indexOf('<A NAME="bottom">');
    if (bottom === -1) {
        throw new Error("bottom of page has not been found");
    }
    html = html.substr(0, bottom);

    // make relative hyperlinks absolute, pointing to billwurtz official
    html = html.replace(/href=["'](?!https?:\/\/?)(\S*)["']/g, 'href="https://billwurtz.com/questions/$1"');

    // split into a list of question
    const list = html.split("</br></br>");

    // remove the head of page
    list.shift();

    return list
        .map(itemHtml => itemHtml.trim())
        .map(itemHtml => {
            if (itemHtml.length >= 10240 - (100)) {
                console.warn("truncating a big record", itemHtml);
                return itemHtml.substr(0, 1000) + "<span style='color: red'>... (too big for the free search engine behind this site)</span>"
            }
            return itemHtml;
        })
        .map(itemHtml => ({
            // consistent identification so the script is idempotent
            objectID: sha1(itemHtml).substr(0, 16), // substr to save space on the free algolia account...
            content_html: itemHtml
        }))
};

const batchUploadRecords = async records => {

    // https://stackoverflow.com/questions/8495687/split-array-into-chunks
    let i, j, temparray, chunk = 300;
    for (i = 0, j = records.length; i < j; i += chunk) {
        temparray = records.slice(i ,i + chunk);

        try {
            const res = await algoliaIndex.addObjects(temparray);
            console.log(res)
        }
        catch (e) {
            console.error(e)
        }
    }
};


const syncLatest = async () => {
    const html = await getLatestPage();
    const records = parsePage(html);
    await batchUploadRecords(records);
};

const syncSpecificMonth = async (year, month) => {
    const html = await getMonthlyPage(year, month);
    const records = parsePage(html);
    await batchUploadRecords(records);
};

const syncFromAncientTimes = async (currentYear, currentMonth) => {
    // until an error occurs...
    while (true) {
        await syncSpecificMonth(currentYear, currentMonth);
        currentMonth -= 1;
        if (currentMonth <= 0) {
            currentYear -= 1;
            currentMonth = 12;
        }
    }
};

const main = async () => {
    try {
        await syncLatest();
        await syncFromAncientTimes(2019, 6)
    }
    catch (e) {
        console.error(e)
    }
};

main();