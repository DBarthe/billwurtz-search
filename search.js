/* global algoliasearch instantsearch */

const searchClient = algoliasearch(
    'RYX8NB8VDZ',
    '0be9afdc21f433777c920af925fb9562'
);

const search = instantsearch({
    indexName: 'qa',
    searchClient: searchClient
});

search.addWidget(
    instantsearch.widgets.searchBox({
        container: '#searchbox'
    })
);

search.addWidget(
    instantsearch.widgets.hits({
        container: '#hits',
        escapeHTML: false,
        templates: {
            item: "</br></br>" + '{{#helpers.highlight}}{ "attribute": "content_html" }{{/helpers.highlight}}',
        },
    })
);

search.addWidget(
    instantsearch.widgets.pagination({
        container: '#pagination',
    })
);

search.start();
