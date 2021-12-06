# Billwurtz search


This is a search engine over [billwurtz Q&A](https://billwurtz.com/questions/questions.html).

Visit https://www.billwurtz-search.com

# Development quickstart
Figured out by @JacksonChen666

0. Install npm packages in `web/`, `api/`, and `machinery/` (one time)
1. Get opensearch/elasticsearch running and functioning (that's up to you)
2. Give the machinery script authentication via username or api keys and run the script
    - You may want to run with the following environment variables:
        - `NODE_TLS_REJECT_UNAUTHORIZED=0` (ignores invalid certificates if you can't figure out disabling opensearch tls, do not use in production)
        - `ELASTIC_URL="https://127.0.0.1:9200"` (change as needed)
        - `ELASTIC_API_KEY="api_key"` (api key for elasticsearch)
3. Get API up and running
    - `node .` is enough assuming the right node is set in the script
4. Get frontend running for development
    1. change url at line 14 in file `web/src/App.js` to something like `http://localhost:7777`
    2. run `npm run start`

