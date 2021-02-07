const requestp = require("request-promise-native");
const sha1 = require("js-sha1");

const { Client: ESClient } = require("@elastic/elasticsearch");
const esClient = new ESClient({
  node: "https://localhost:9200",
  auth: {
    apiKey: process.env.ELASTIC_API_KEY
  },
});

const fs = require("fs");
const path = require("path");
const cacheDir = "./tmp";
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir);
}

const getPage = async (url) => {
  const cachedFile = path.join(cacheDir, sha1(url));

  if (fs.existsSync(cachedFile)) {
    console.log("using cached version of ", url);
    return fs.readFileSync(cachedFile, "utf8");
  } else {
    console.log("downloading ", url);
    const content = await requestp(url);
    fs.writeFileSync(cachedFile, content, { mode: 0o660 });
    return content;
  }
};

const latestUrl = "https://billwurtz.com/questions/questions.html";
const getLatestPage = () => getPage(latestUrl);

const monthlyUrl = (year, month) =>
  `https://billwurtz.com/questions/questions-${year}-${("" + month).padStart(
    2,
    "0"
  )}.html`;
const getMonthlyPage = (year, month) => getPage(monthlyUrl(year, month));

const parsePage = (html) => {
  // remove the bottom of page
  const bottom = html.indexOf('<A NAME="bottom">');
  if (bottom === -1) {
    throw new Error("bottom of page has not been found");
  }
  html = html.substr(0, bottom);

  // make relative hyperlinks absolute, pointing to billwurtz official
  html = html.replace(
    /href=["'](?!https?:\/\/?)(\S*)["']/g,
    'href="https://billwurtz.com/questions/$1"'
  );

  // split into a list of question
  const list = html.split("</br></br>");

  // remove the head of page
  list.shift();

  return list
    .map((itemHtml) => itemHtml.trim())
    .map((itemHtml) => {
      if (itemHtml.length >= 10240 - 100) {
        console.warn("truncating a big record");
        return (
          itemHtml.substr(0, 10240 - 100) +
          "<span style='color: red'>... (too big for the free search engine behind this site)</span>"
        );
      }
      return itemHtml;
    })
    .map((itemHtml) => ({
      // consistent identification so the script is idempotent
      id: sha1(itemHtml),
      content_html: itemHtml,
    }));
};

const batchUploadRecords = async (records) => {
  // https://stackoverflow.com/questions/8495687/split-array-into-chunks
  let i,
    j,
    temparray,
    chunk = 300;
  for (i = 0, j = records.length; i < j; i += chunk) {
    temparray = records.slice(i, i + chunk);

    console.log("inserting bulk to es");
    const body = temparray.flatMap((record) => [
      { index: { _index: "qa", _id: record.id, _type: "_doc" } },
      { content_html: record.content_html },
    ]);

    const { body: bulkResponse } = await esClient.bulk({ refresh: true, body });

    if (bulkResponse.errors) {
      const erroredDocuments = [];
      // The items array has the same order of the dataset we just indexed.
      // The presence of the `error` key indicates that the operation
      // that we did for the document has failed.
      bulkResponse.items.forEach((action, i) => {
        const operation = Object.keys(action)[0];
        if (action[operation].error) {
          erroredDocuments.push({
            // If the status is 429 it means that you can retry the document,
            // otherwise it's very likely a mapping error, and you should
            // fix the document before to try it again.
            status: action[operation].status,
            error: action[operation].error,
            operation: body[i * 2],
            document: body[i * 2 + 1],
          });
        }
      });
      console.log(erroredDocuments);
    }
  }
};

const syncLatest = async () => {
  const html = await getLatestPage();
  const records = parsePage(html);
  await batchUploadRecords(records);
  return records.length;
};

const syncSpecificMonth = async (year, month) => {
  const html = await getMonthlyPage(year, month);
  const records = parsePage(html);
  await batchUploadRecords(records);
  return records.length;
};

const syncFromAncientTimes = async (currentYear, currentMonth) => {
  // until an error occurs...
  let total = 0;

  try {
    while (true) {
      total += await syncSpecificMonth(currentYear, currentMonth);
      currentMonth -= 1;
      if (currentMonth <= 0) {
        currentYear -= 1;
        currentMonth = 12;
      }
    }
  } catch (e) {
    if (e.statusCode == 404) {
      console.log("received 404 error");
      return total;
    }
    throw e;
  }
};

const main = async () => {
  try {
    let total = 0;
    total += await syncLatest();
    total += await syncFromAncientTimes(2021, 1);
    console.log("total = ", total);
  } catch (e) {
    console.error(e);
  }
};

main();
