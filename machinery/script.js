require("dotenv").config();
const requestp = require("request-promise-native");
const sha1 = require("js-sha1");
const fs = require("fs");
const path = require("path");
const { Client: ESClient } = require("@elastic/elasticsearch");

const elasticUrl = process.env.ELASTIC_URL || "https://localhost:9200";
const elasticApiKey = process.env.ELASTIC_API_KEY;
const recreateIndex =
  process.env.RECREATE_INDEX && process.env.RECREATE_INDEX === "true";

const indexConfig = {
  mappings: {
    properties: {
      date: {
        type: "date",
      },
      content_html: {
        type: "text",
        analyzer: "my_analyzer",
        fields: {
          keyword: {
            type: "keyword",
            ignore_above: 256,
          },
        },
      },
    },
  },
  settings: {
    analysis: {
      char_filter: {
        billwurtz_html: {
          type: "pattern_replace",
          pattern: "(<[^><]*)<",
          replacement: "$1><",
        },
      },
      analyzer: {
        my_analyzer: {
          filter: ["lowercase"],
          char_filter: ["billwurtz_html", "html_strip"],
          tokenizer: "standard",
        },
      },
    },
  },
};

const esClient = new ESClient({
  node: elasticUrl,
  auth: {
    apiKey: elasticApiKey,
  },
  ssl: {
    ca: fs.readFileSync("./cacert.pem"),
  },
});

const cacheDir = "./tmp";
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir);
}

const getPage = async (url, useCache = true) => {
  const cachedFile = path.join(cacheDir, sha1(url));

  if (useCache && fs.existsSync(cachedFile)) {
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
const getLatestPage = () => getPage(latestUrl, false);

const monthlyUrl = (year, month) =>
  `https://billwurtz.com/questions/questions-${year}-${("" + month).padStart(
    2,
    "0"
  )}.html`;
const getMonthlyPage = (year, month) => getPage(monthlyUrl(year, month));

const parseDate = (itemHtml) => {
  const regexDate = /([1-9]|1[012])\.([1-9]|[0-2][0-9]|3[01])\.([12][0-9])[\s\S]*[^0-9]([0-9]|1[012]):(?:[\s\S]*[^0-9])?([0-9]|[0-5][0-9]) (am|apm|pm)/;
  const matchDate = regexDate.exec(itemHtml.replace(/&nbsp;/g, " "));
  if (matchDate === null) {
    throw Error(`cannot parse date in : ${itemHtml}, match was : ${matchDate}`);
  }
  const year = 2000 + parseInt(matchDate[3]);
  const month = parseInt(matchDate[1]) - 1;
  const day = parseInt(matchDate[2]);
  const half = matchDate[6];
  const hour = parseInt(matchDate[4]) + (half === "pm" ? 12 : 0);
  const minute = parseInt(matchDate[5]);

  if (year > 2021) {
    throw Error(`cannot parse date in : ${itemHtml}, match was : ${matchDate}`); 
  }

  const date = new Date(year, month, day, hour, minute);

  console.log(date);

  return date;
};


const parsePage = (html) => {
  // remove the bottom of page
  let bottom = html.indexOf('<A NAME="bottom">');
  if (bottom === -1) {
    console.log("bottom of page has not been found, trying other method");
    const match = html.match(/(<\/br>\s*\n)+/gi);
    if (match) {
      bottom = html.lastIndexOf(match[match.length - 1]);
    }
  }

  if (bottom === -1) {
    throw new "bottom of page has not been found after using other method"();
  }

  html = html.substr(0, bottom);

  // make relative hyperlinks absolute, pointing to billwurtz official
  html = html.replace(
    /href=["'](?!https?:\/\/?)(\S*)["']/g,
    'href="https://billwurtz.com/questions/$1"'
  );

  // split into a list of question
  const list = html.split("</br></br><h3>");

  // remove the head of page
  list.shift();

  return list
    .map((itemHtml) => itemHtml.trim())
    .map((itemHtml) => {
      if (itemHtml.startsWith("<h3>") || itemHtml.startsWith("<H3>")) {
        return itemHtml
      }
      return "<h3>" + itemHtml;
    })
    .map((itemHtml) => {
      if (false && itemHtml.length >= 10240 - 100) {
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
      date: parseDate(itemHtml),
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
      { content_html: record.content_html, date: record.date },
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

const initIndex = async () => {
  const exists = await esClient.indices.exists({ index: "qa" });

  if (exists.body && recreateIndex) {
    console.log("deleting index");
    const del = await esClient.indices.delete({
      index: "qa",
    });
    if (!del.body.acknowledged) {
      console.log(del);
      throw new Error("failed to delete the index");
    }
  }

  if (!exists.body || recreateIndex) {
    console.log("creating index");
    const create = await esClient.indices.create({
      index: "qa",
      body: indexConfig,
    });
    if (!create.body.acknowledged) {
      console.log(create);
      throw new Error("failed to create the index");
    }
  }
};

const main = async () => {
  try {
    await initIndex();

    let total = 0;
    total += await syncLatest();
    total += await syncFromAncientTimes(2021, 01);
    console.log("total = ", total);
  } catch (e) {
    console.error(e);
  }
};

main();
