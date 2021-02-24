require("dotenv").config();
const express = require("express");
const fs = require("fs");

const app = express();

const { Client: ESClient } = require("@elastic/elasticsearch");

const esClient = new ESClient({
  node: "https://localhost:9200",
  auth: {
    apiKey: process.env.ELASTIC_API_KEY,
  },
  ssl: {
    ca: fs.readFileSync("./cacert.pem"),
  },
});

const validateRequest = (req) => {
  const { body } = req;

  if (body === undefined || typeof body !== "object") {
    return false;
  }

  if (body.term === undefined || typeof body.term !== "string") {
    return false;
  }
  if (
    body.size === undefined ||
    !Number.isInteger(body.size) ||
    body.size < 0
  ) {
    return false;
  }
  if (
    body.from === undefined ||
    !Number.isInteger(body.from) ||
    body.from < 0
  ) {
    return false;
  }

  return true;
};

const buildQuery = (req) => {
  const { body } = req;

  const theQuery = {
    size: body.size,
    from: body.from,
    query: { match_all: {} },
    highlight: {
      pre_tags: ["<mark>"],
      post_tags: ["</mark>"],
      fields: { content_html: {} },
      number_of_fragments: 0,
    },
    _source: { includes: ["*"], excludes: [] },
  };

  if (body.term === "") {
    theQuery.sort = [{ date: "desc" }];
  }

  if (body.term !== "") {
    theQuery.query = {
      bool: {
        must: [
          {
            bool: {
              must: [
                {
                  bool: {
                    should: [
                      {
                        match: {
                          content_html: {
                            query: body.term,
                            fuzziness: 0,
                            boost: 1
                          },
                        },
                      },
                      {
                        match_phrase: {
                          content_html: {
                            query: body.term,
                            boost: 10,
                          },
                        },
                      },
                      {
                        match_phrase_prefix: {
                          content_html: {
                            query: body.term,
                            boost: 5
                          },
                        },
                      },
                    ],
                    minimum_should_match: "1",
                  },
                },
              ],
            },
          },
        ],
      },
    };
  }

  return theQuery;
};

app.use(express.json());

app.use("/search", async (req, res) => {
  console.log("Verifying requests ✔", req.body);

  if (!validateRequest(req)) {
    console.log("invalid request");
    return res.status(400).send("bad request");
  }

  const esResponse = await esClient.msearch({
    body: [{ index: "qa" }, buildQuery(req)],
  });

  res.json(esResponse.body);
});

app.listen(7777, () =>
  console.log("Server running at http://localhost:7777 🚀")
);
